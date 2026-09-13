from pathlib import Path
import sys, math, os
import vtk
import numpy as np
from vtk.util.numpy_support import numpy_to_vtk, vtk_to_numpy
from PIL import Image

root=Path(__file__).resolve().parents[1]
(root/'previews').mkdir(exist_ok=True)
file=sys.argv[1] if len(sys.argv)>1 else str(root/'changyi-pavilion-compatible.glb')
window=vtk.vtkRenderWindow();window.SetOffScreenRendering(1);window.SetSize(1600,1100);window.SetMultiSamples(4)
imp=vtk.vtkGLTFImporter();imp.SetFileName(file);imp.SetRenderWindow(window);imp.Update()
renderer=window.GetRenderers().GetFirstRenderer();renderer.SetBackground(.68,.73,.70)
renderer.RemoveAllLights();renderer.AutomaticLightCreationOff();renderer.UseImageBasedLightingOn()
width,height=512,256
pixels=np.zeros((height,width,3),dtype=np.float32)
for y in range(height):
 t=y/(height-1)
 for x in range(width):
  glow=max(0,math.cos((x/width-.3)*math.pi*2))**20 * max(0,1-abs(t-.66)*7)
  base=np.array([.27,.30,.27])*(1-t)+np.array([.59,.68,.74])*t
  pixels[y,x,:]=base*.63+np.array([.7,.48,.22])*glow*.22
img=vtk.vtkImageData();img.SetDimensions(width,height,1);img.GetPointData().SetScalars(numpy_to_vtk(pixels.reshape(-1,3),deep=True,array_type=vtk.VTK_FLOAT))
env=vtk.vtkTexture();env.SetInputData(img);env.InterpolateOn();env.MipmapOn();renderer.SetEnvironmentTexture(env)
renderer.SetEnvironmentUp(0,1,0);renderer.SetEnvironmentRight(1,0,0)
for pos,color,power in [((-18,10,8),(1,.86,.68),2.2),((8,6,-12),(.68,.82,1),.48)]:
 light=vtk.vtkLight();light.SetLightTypeToSceneLight();light.SetPositional(False);light.SetPosition(*pos);light.SetFocalPoint(0,0,0);light.SetColor(*color);light.SetIntensity(power);renderer.AddLight(light)
actors=renderer.GetActors();actors.InitTraversal();n=0
while True:
 actor=actors.GetNextActor()
 if actor is None:break
 n+=1
 actor.GetProperty().SetAmbient(.12)
 # VTK's direct vertex colours replace diffuse colour. glTF multiplies them.
 # Bake that multiplication for this offline preview only; do not alter the GLB.
 mapper=actor.GetMapper(); poly=mapper.GetInput()
 colours=poly.GetPointData().GetArray('COLOR_0') if poly else None
 if colours is not None:
  rgb=vtk_to_numpy(colours).copy()
  rgb[:,:3]*=np.asarray(actor.GetProperty().GetColor())
  corrected=numpy_to_vtk(rgb,deep=True);corrected.SetName('COLOR_0')
  poly.GetPointData().RemoveArray('COLOR_0');poly.GetPointData().AddArray(corrected)
  poly.GetPointData().SetActiveScalars('COLOR_0')
  mapper.SetScalarModeToUsePointFieldData();mapper.SelectColorArray('COLOR_0')
  mapper.SetColorModeToDirectScalars();mapper.ScalarVisibilityOn()
  actor.GetProperty().SetColor(1,1,1)
# Image-based lighting and the two authored directional lights use the same PBR
# textures as the GLB. Water remains the documented static export approximation.
camera=renderer.GetActiveCamera();camera.SetViewUp(0,1,0);camera.SetViewAngle(39)
views={
 'moon-gate':((10.65,3.42,24.5),(4.7,1.68,16.3)),
 'garden-overview':((19,16,32),(.2,1.7,5.4)),
 'tea-details':((.45,2.35,.58),(-.66,1.52,-.7)),
 'iris-details':((-.9,1.5,15.6),(-2.15,.35,12.65)),
 'moon-gate-reverse':((.0,2.8,8.9),(4.7,1.65,16.3)),
}
selected=sys.argv[2:] or ['moon-gate']
for name in selected:
 pos,target=views[name];camera.SetPosition(*pos);camera.SetFocalPoint(*target);camera.SetViewUp(0,1,0);renderer.ResetCameraClippingRange();window.Render()
 shot=vtk.vtkWindowToImageFilter();shot.SetInput(window);shot.SetInputBufferTypeToRGB();shot.ReadFrontBufferOff();shot.Update()
 output=root/'previews'/f'{name}.png';temporary=output.with_suffix('.tmp')
 data=shot.GetOutput();w,h,_=data.GetDimensions()
 pixels=vtk_to_numpy(data.GetPointData().GetScalars()).reshape(h,w,3)[::-1].copy()
 with temporary.open('wb') as handle:
  Image.fromarray(pixels).save(handle,format='PNG');handle.flush();os.fsync(handle.fileno())
 with Image.open(temporary) as check:check.load()
 os.replace(temporary,output)
 print(str(output),flush=True)
print('Actors:',n,flush=True)
