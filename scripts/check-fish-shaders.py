"""Compile the actual Three.js shaders as GLSL ES 3.00, without changing dialect.

Linux EGL diagnostic; requires moderngl. No video, model export or scene render.
The negative control proves this compiler catches the reported browser failure.
"""
from pathlib import Path
import json
import re
import subprocess
import tempfile
import moderngl

root=Path(__file__).resolve().parents[1]
revision=re.search(r'name="pavilion-version"\s+content="([^"]+)"',(root/'index.html').read_text()).group(1)
report={'revision':revision,'sourceLanguage':'GLSL ES 3.00 (#version 300 es preserved)',
        'browserCapture':False,'glbExported':False,'framesGenerated':0}
with tempfile.TemporaryDirectory(prefix='fish-shader-check-',dir=root.parent) as folder:
    work=Path(folder)
    subprocess.run(['node',str(root/'scripts/prepare-fish-preview.mjs'),folder,'--shaders-only'],
                   cwd=root,check=True,capture_output=True,text=True)
    ctx=moderngl.create_standalone_context(backend='egl',require=430)
    try:
        report['compiler']=ctx.info['GL_VERSION']
        report['programs']=[]
        for name in ['fish','fish-production','fish-fins','fish-fins-production','bed','water']:
            vertex=(work/(name+'.vert')).read_text()
            fragment=(work/(name+'.frag')).read_text()
            assert vertex.startswith('#version 300 es') and fragment.startswith('#version 300 es')
            program=ctx.program(vertex_shader=vertex,fragment_shader=fragment)
            program.release()
            report['programs'].append({'name':name,'compiled':True,'linked':True})
        vertex=(work/'fish-production.vert').read_text()
        fragment=(work/'fish-production.frag').read_text()
        assert 'float patchNoise=' in fragment
        original=re.sub(r'\bpatchNoise\b','patch',fragment)
        try:
            program=ctx.program(vertex_shader=vertex,fragment_shader=original)
        except moderngl.Error as error:
            message=str(error)
            assert 'reserved word' in message and 'patch' in message, message
            report['originalErrorReproduced']=True
            report['originalError']=message.strip()
        else:
            program.release()
            raise AssertionError('Compiler incorrectly accepted the original reserved identifier')
    finally:
        ctx.release()
print(json.dumps(report,ensure_ascii=False,indent=2))
