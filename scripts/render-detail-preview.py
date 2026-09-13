"""Native geometry/albedo inspection; simplified lighting, not browser screenshots."""
from pathlib import Path
import json,sys
import numpy as np
import moderngl
from PIL import Image
root=Path(__file__).resolve().parents[1]
work=Path(sys.argv[1]) if len(sys.argv)>1 else root.parent/'detail-preview-work'
meta=json.loads((work/'scene.json').read_text())
ctx=moderngl.create_standalone_context(backend='egl',require=330)
program=ctx.program(vertex_shader='''#version 330
in vec3 position;in vec3 normal;in vec2 uv;in vec3 color;in mat4 instanceMatrix;in vec3 instanceColor;
uniform mat4 view,projection;uniform mat3 uvMatrix;
out vec3 n;out vec2 texCoord;out vec3 tint;out vec3 world;
void main(){vec4 p=instanceMatrix*vec4(position,1);world=p.xyz;n=normalize(transpose(inverse(mat3(instanceMatrix)))*normal);texCoord=(uvMatrix*vec3(uv,1)).xy;tint=color*instanceColor;gl_Position=projection*view*p;}
''',fragment_shader='''#version 330
in vec3 n;in vec2 texCoord;in vec3 tint;in vec3 world;
uniform sampler2D albedo;uniform vec3 base,emission;uniform float opacity;
out vec4 frag;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec4 tex=texture(albedo,texCoord);if(tex.a<.45)discard;
vec3 normal=normalize(n)*(gl_FrontFacing?1.:-1.);
vec3 light=mix(vec3(.16,.17,.13),vec3(.56,.61,.64),normal.y*.5+.5);
light+=vec3(1.,.81,.62)*1.35*max(0.,dot(normal,normalize(vec3(-18,10,8))));
light+=vec3(.62,.75,1.)*.30*max(0.,dot(normal,normalize(vec3(8,6,-12))));
vec3 col=pow(tex.rgb,vec3(2.2))*base*tint*light+emission;
frag=vec4(pow(aces(col),vec3(1./2.2)),opacity*tex.a);}
''')
resources=[];draws=[];textures=[]
white=ctx.texture((1,1),4,bytes([255]*4))
for mat in meta['materials']:
    if mat['texture']:
        im=Image.open(work/mat['texture']).convert('RGBA')
        if mat['flipY']:im=im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        tex=ctx.texture(im.size,4,im.tobytes());tex.repeat_x=tex.repeat_y=True;tex.build_mipmaps();textures.append(tex)
    else:textures.append(white)
for mesh in meta['meshes']:
    content=[]
    for attr,size in [('position',3),('normal',3),('uv',2),('color',3)]:
        b=ctx.buffer((work/mesh['attrs'][attr]).read_bytes());resources.append(b);content.append((b,f'{size}f',attr))
    for name,size,attr in [('matrix',16,'instanceMatrix'),('instanceColor',3,'instanceColor')]:
        b=ctx.buffer((work/mesh[name]).read_bytes());resources.append(b);content.append((b,f'{size}f /i',attr))
    idx=ctx.buffer((work/mesh['index']).read_bytes());resources.append(idx)
    draws.append((mesh,ctx.vertex_array(program,content,index_buffer=idx,index_element_size=4)))
width,height=1440,960
color=ctx.texture((width,height),4);fbo=ctx.framebuffer([color],ctx.depth_renderbuffer((width,height)))
ctx.enable(moderngl.DEPTH_TEST);program['albedo'].value=0
for name,view in meta['views'].items():
    fbo.use();fbo.clear(.68,.73,.70,1,depth=1)
    program['view'].write(np.array(view['view'],dtype='f4').tobytes());program['projection'].write(np.array(view['projection'],dtype='f4').tobytes())
    for transparent in [False,True]:
        if transparent:ctx.enable(moderngl.BLEND);ctx.blend_func=(moderngl.SRC_ALPHA,moderngl.ONE_MINUS_SRC_ALPHA)
        else:ctx.disable(moderngl.BLEND)
        for mesh,vao in draws:
            mat=meta['materials'][mesh['material']]
            if mat['transparent']!=transparent:continue
            if mat['doubleSided']:ctx.disable(moderngl.CULL_FACE)
            else:ctx.enable(moderngl.CULL_FACE)
            textures[mesh['material']].use(0)
            for key,value in [('base',mat['color']),('emission',mat['emissive']),('opacity',mat['opacity'])]:program[key].value=value
            program['uvMatrix'].write(np.array(mat.get('uvMatrix') or [1,0,0,0,1,0,0,0,1],dtype='f4').tobytes())
            vao.render(instances=mesh['count'])
    pixels=np.frombuffer(fbo.read(components=3,alignment=1),dtype='u1').reshape(height,width,3)[::-1].copy()
    out=root/'previews'/f'{name}.jpg';Image.fromarray(pixels).save(out,quality=94,subsampling=0);print(out,flush=True)
print(json.dumps({'renderer':ctx.info['GL_RENDERER'],'views':list(meta['views']),'browserCapture':False,'lighting':'simplified; geometry and albedo from source'}))
