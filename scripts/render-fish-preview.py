"""Native EGL preview of the actual fish shaders, simulation and lake shader.

This is a fish study, not a recording of the complete browser application.
Run prepare-fish-preview.mjs first. Requires moderngl, numpy and Pillow.
"""
from pathlib import Path
import json,sys,os,subprocess,math
import numpy as np
import moderngl
from PIL import Image

root=Path(__file__).resolve().parents[1]
arguments=[value for value in sys.argv[1:] if not value.startswith('--')]
work=Path(arguments[0]) if arguments else root.parent/'fish-preview-work'
movie='--movie' in sys.argv
meta=json.loads((work/'scene.json').read_text())
width,height=meta['width'],meta['height']
ctx=moderngl.create_standalone_context(backend='egl',require=430)
programs={}
for name in ['fish','fish-production','fish-fins','fish-fins-production','bed','water']:
    # Preserve WebGL's shader language: rewriting this to desktop GLSL can let
    # identifiers pass here even though they are reserved in GLSL ES 3.00.
    programs[name]=ctx.program(vertex_shader=(work/(name+'.vert')).read_text(),fragment_shader=(work/(name+'.frag')).read_text())
view=np.array(meta['view'],dtype='f4').reshape(4,4).T
projection=np.array(meta['projection'],dtype='f4').reshape(4,4).T
identity=np.eye(4,dtype='f4')
def set_uniform(program,name,value):
    if name not in program:return
    if isinstance(value,np.ndarray):program[name].write(np.asarray(value,dtype='f4').T.tobytes())
    else:program[name].value=value
for name in ['fish','fish-fins','bed']:
    program=programs[name]
    for key,value in [('modelMatrix',identity),('modelViewMatrix',view),('projectionMatrix',projection),('normalMatrix',view[:3,:3]),('viewMatrix',view),('isOrthographic',False),('diffuse',(1,1,1)),('opacity',1.),('emissive',(0,0,0)),('roughness',.96),('metalness',0.),('ior',1.10),('specularIntensity',1.),('specularColor',(1,1,1)),('clearcoat',.08),('clearcoatRoughness',.38),('ambientLightColor',(.05,.055,.05)),('uFishNight',0.)]:set_uniform(program,key,value)
    for i,(position,colour,power) in enumerate([((-18,10,8),(1,.745,.456),2.65),((8,6,-12),(.584,.716,.807),.38)]):
        direction=np.array(position,dtype='f4');direction/=np.linalg.norm(direction)
        set_uniform(program,f'directionalLights[{i}].direction',tuple(view[:3,:3]@direction))
        set_uniform(program,f'directionalLights[{i}].color',tuple(np.array(colour)*power))
    set_uniform(program,'hemisphereLights[0].direction',tuple(view[:3,:3]@np.array([0,1,0])))
    set_uniform(program,'hemisphereLights[0].skyColor',(.53,.60,.64))
    set_uniform(program,'hemisphereLights[0].groundColor',(.12,.125,.08))

buffers=[]
def vao(name,program,instances=False):
    content=[]
    for key,attr in meta['geometries'][name]['attrs'].items():
        if key not in program:continue
        buffer=ctx.buffer((work/f'{name}-{key}.bin').read_bytes());buffers.append(buffer)
        content.append((buffer,f"{attr['size']}f",key))
    instance_buffer=None
    if instances:
        instance_buffer=ctx.buffer(reserve=120*24*4);buffers.append(instance_buffer)
        content.append((instance_buffer,'16f 4f 4f /i','instanceMatrix','fishMotion','fishAppearance'))
    index=ctx.buffer((work/f'{name}-index.bin').read_bytes());buffers.append(index)
    return ctx.vertex_array(program,content,index_buffer=index,index_element_size=4),instance_buffer
fish_vaos=[vao(name,programs['fish'],True) for name in ['high','low']]
fin_vaos=[vao(name,programs['fish-fins'],True) for name in ['high','low']]
bed_vao,_=vao('bed',programs['bed']);water_vao,_=vao('water',programs['water'])
refraction_size=(int(width*1.5),int(height*1.5))
refracted=ctx.texture(refraction_size,4,dtype='f2');refracted.filter=(moderngl.LINEAR,moderngl.LINEAR)
depth=ctx.depth_texture(refraction_size);depth.compare_func=''
underwater=ctx.framebuffer([refracted],depth)
colour=ctx.texture((width,height),4);final=ctx.framebuffer([colour],ctx.depth_renderbuffer((width,height)))
# A calm sky reflection for this isolated fish study. Architecture is omitted.
sky=np.zeros((128,256,3),dtype='f4')
for row in range(128):
    t=row/127;sky[row,:,:]=np.array([.23,.34,.34])*(1-t)+np.array([.60,.70,.69])*t
reflection=ctx.texture((256,128),3,sky.tobytes(),dtype='f4');reflection.filter=(moderngl.LINEAR,moderngl.LINEAR)
textures=[reflection,refracted,depth]
for filename in ['water-normal-1.jpg','water-normal-2.jpg']:
    image=Image.open(root/'public/textures'/filename).convert('RGB').transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    texture=ctx.texture(image.size,3,image.tobytes());texture.repeat_x=texture.repeat_y=True;texture.build_mipmaps();textures.append(texture)
water_program=programs['water']
bias=np.array([[.5,0,0,.5],[0,.5,0,.5],[0,0,.5,.5],[0,0,0,1]],dtype='f4')
for key,value in [('modelMatrix',identity),('projectionMatrix',projection),('viewMatrix',view),('reflectionMatrix',bias@projection@view),('refractionMatrix',bias@projection@view),('inverseRefractionProjection',np.linalg.inv(projection)),('refractionCameraWorld',np.linalg.inv(view)),('cameraPosition',tuple(meta['camera'])),('toneMappingExposure',1.04),('scatterColor',(.025,.072,.066)),('illumination',1.),('sunDirection',tuple(np.array([-18,10,8])/np.linalg.norm([-18,10,8]))),('sunColor',(1,.784,.508))]:set_uniform(water_program,key,value)
for slot,name in enumerate(['reflectionMap','refractionMap','depthMap','normalMap0','normalMap1']):water_program[name].value=slot
ctx.enable(moderngl.DEPTH_TEST);ctx.disable(moderngl.CULL_FACE)
output=root/'previews';output.mkdir(exist_ok=True)
encoder=None
if movie:
    encoder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(meta['fps']),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(output/'fish-swimming-v12.mp4')],stdin=subprocess.PIPE)
try:
    for frame,data in enumerate(meta['frames'] if movie else meta['frames'][:1]):
        underwater.use();underwater.clear(.04,.10,.08,1,depth=1)
        ctx.depth_mask=True;ctx.disable(moderngl.BLEND);bed_vao.render()
        set_uniform(programs['fish'],'uFishTime',data['time'])
        for name,(mesh,instance_buffer),level in zip(['high','low'],fish_vaos,data['levels']):
            if not level['count']:continue
            group=meta['geometries'][name]['groups'][0]
            instance_buffer.write((work/level['file']).read_bytes());mesh.render(first=group['start'],vertices=group['count'],instances=level['count'])
        ctx.enable(moderngl.BLEND);ctx.blend_func=(moderngl.SRC_ALPHA,moderngl.ONE_MINUS_SRC_ALPHA);ctx.depth_mask=False
        set_uniform(programs['fish-fins'],'uFishTime',data['time'])
        for name,(mesh,instance_buffer),level in zip(['high','low'],fin_vaos,data['levels']):
            if not level['count']:continue
            group=meta['geometries'][name]['groups'][1]
            instance_buffer.write((work/level['file']).read_bytes());mesh.render(first=group['start'],vertices=group['count'],instances=level['count'])
        ctx.depth_mask=True;ctx.disable(moderngl.BLEND)
        final.use();final.clear(.2,.3,.3,1,depth=1)
        for slot,texture in enumerate(textures):texture.use(slot)
        water_program['time'].value=data['time'];water_vao.render()
        pixels=np.frombuffer(final.read(components=3,alignment=1),dtype='u1').reshape(height,width,3)[::-1].copy()
        if frame==0:
            file=output/'fish-swimming-v12.jpg';temporary=file.with_suffix('.tmp')
            with temporary.open('wb') as handle:Image.fromarray(pixels).save(handle,format='JPEG',quality=94,subsampling=0);handle.flush();os.fsync(handle.fileno())
            os.replace(temporary,file);print(str(file),flush=True)
        if encoder:encoder.stdin.write(pixels.tobytes())
finally:
    if encoder:encoder.stdin.close();assert encoder.wait()==0
print(json.dumps({'shaderProgramsCompiled':6,'renderer':ctx.info['GL_RENDERER'],'framesRendered':frame+1,'browserCapture':False}),flush=True)
