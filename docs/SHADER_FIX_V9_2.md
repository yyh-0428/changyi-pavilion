# V9.2：鲤鱼材质编译修复

用户提供的浏览器日志给出了确定原因：`锦鲤·暖玉朱金鳞光` 片元着色器使用 `patch` 作为局部变量，而它在 GLSL ES 3.00 中是保留字。编译失败之后，浏览器反复报告 `useProgram: program not valid`，鱼体无法绘制。

修复只将该变量及引用改为 `patchNoise`，并把材质缓存键升级为 `pavilion-koi-v2`。鱼的花色公式、几何、数量、游动轨迹、水面光学和碰撞计算不变。整包版本号更新为 9.2。

## 为什么此前没有发现

此前原生预览脚本把 Three.js 生成的 `#version 300 es` 替换成桌面 `#version 330`。本环境的桌面方言接受了该变量名，因此此前的原生编译结果不能代表 WebGL 着色器兼容性。V9.1 的线程和图层检查也没有检查 GLSL 编译。

已删除这处版本替换；新增 `scripts/check-fish-shaders.py`，从真实材质的 `onBeforeCompile` 和 Three.js 的 `WebGLProgram` 生成源码，按原始 GLSL ES 3.00 编译。程序检查包含鱼材质、带环境/阴影/雾的鱼材质变体、湖底和水面。无需导出 GLB、生成视频或绘制场景。

## 本次验证

- 修复前的两种鱼材质都复现 `illegal use of reserved word patch`，与用户日志一致。
- 修复后 4 个程序全部编译和链接成功。
- 负向检查把当前鱼材质还原为原变量名，确认编译器确实拒绝它，避免语言版本转换再次掩盖错误。
- 重新完成 Vite 生产构建，包内 `dist` 使用修正后的材质。

原始编译结果见 `SHADER_AUDIT_V9_2.json`。编译器为本环境 Mesa EGL 上下文，输入保持 `#version 300 es`；这不是用户设备上的浏览器录屏或所有设备性能保证。本次未重新运行与这三行材质修改无关的完整物理/模型测试，V9.1 的 14 项结果保留为此前记录。

## 使用

已有 V9 或 V9.1 本地项目时，从此包取出 `src/fish-material.js`，覆盖旧项目同名文件，然后刷新网页即可；无需重新安装依赖。若完整升级，停止旧项目，解压 V9.2 并启动其中的 `Start-Mac.command`。部署静态网站时使用本包完整 `dist`，或自行运行 `npm run build`。

仅覆盖材质文件会修复着色器，但界面内的版本诊断仍显示旧项目版本；完整升级后 `window.__pavilion.version` 为 `9.2`。本包不包含 GLB/glTF，也未重新导出建筑或生成视频。

支持 EGL 的 Linux 诊断环境安装 Python `moderngl` 后，可运行 `python3 scripts/check-fish-shaders.py`；这不是网页启动依赖。
