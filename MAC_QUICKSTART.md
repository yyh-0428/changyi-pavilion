# Mac 快捷启动

1. 解压完整的 `changyi-pavilion-v4-mac.zip`，保留文件夹内的所有文件。
2. 双击文件夹里的 **Start-Mac.command**。
3. 首次运行会安装项目依赖，随后自动打开长衣亭。以后只需再次双击。

如果没有合适的 Node.js，脚本会打开 [Node.js 官方下载页](https://nodejs.org/en/download)。安装 **24 LTS** 后，再双击启动文件。项目需要 Node.js 20.19+ 或 22.12+；脚本不会自动安装 Homebrew、修改系统设置或索取管理员密码。

浏览时保留启动的终端窗口。结束时按 **Control+C**，或双击 **Stop-Mac.command**。

## 脚本会处理的情况

- 从 Finder 启动，或项目目录含中文、空格：自动定位到正确目录。
- Intel / Apple Silicon：使用本机 Node.js 对应的依赖，不随包携带其他系统的 `node_modules`。
- 常见 Node.js 安装位置：系统路径、Homebrew、nvm、Volta、asdf 和 fnm。
- 首次使用、依赖清单变化或 Node 主版本 / CPU 架构变化：重新安装依赖；其余启动复用本地依赖，可离线打开。
- 默认端口 4173 被占用：由 Vite 选下一个可用端口，再打开实际地址。
- 重复双击：验证并复用同一项目正在运行的服务。
- 停止：通过本项目的随机会话令牌请求退出，不按端口或进程名批量杀进程。

服务仅监听本机 `127.0.0.1`，保留原 `/changyi-pavilion/` 子路径。

## 遇到问题

**依赖下载失败**：检查网络后重新双击。脚本不会把失败的安装标记为完成。

**浏览器没自动打开**：复制启动窗口显示的完整网址，包括末尾 `/changyi-pavilion/`。

**无法双击执行**：压缩包已保留执行权限。如果解压工具丢失了权限，打开终端，输入 `cd `，将项目文件夹拖入终端并回车，然后执行：

```sh
bash Start-Mac.command
```

**启动条件检查**（不会启动服务或安装依赖）：

```sh
bash Start-Mac.command --check
```

**启动后卡在依赖或服务准备阶段**：回到原终端窗口按 Control+C，再重新双击。停止脚本无法确认服务身份时，也会提示使用原窗口。

兼容 GLB 可单独下载或运行 `npm run export:model -- --compatible` 生成。它不是打开网页的必需文件，因此 Mac 启动包只带轻量 GLB，减小下载体积。

本轮已在 Linux 环境检查 Bash 语法、路径处理、依赖缓存与异常、会话复用、停止认证和端口选择逻辑。Finder 双击、Safari/WebGL 和真实 Mac 性能尚未实测。

参考：[Apple 关于 .command 双击运行的说明](https://developer.apple.com/library/archive/documentation/Porting/Conceptual/PortingUnix/unix_environments/unix_environments.html)、[Node.js 下载](https://nodejs.org/en/download)。
