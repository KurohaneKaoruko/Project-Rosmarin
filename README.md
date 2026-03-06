# Project-Rosmarin

> 一个以 `Next.js + React + TypeScript` 构建的互动实验与项目合集仓库，覆盖游戏、可视化模拟、实用工具等多种类型。

![Next.js](https://img.shields.io/badge/Next.js-15.2.8-000000?logo=next.js)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss)
![Vitest](https://img.shields.io/badge/Test-Vitest-729B1B?logo=vitest)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

## 目录

- [项目简介](#项目简介)
- [模块地图](#模块地图)
- [功能亮点](#功能亮点)
- [快速开始](#快速开始)
- [可用脚本](#可用脚本)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [许可证](#许可证)

## 项目简介

Project-Rosmarin 是一个“可玩 + 可看 + 可用”的前端项目集合：

- `Games`：交互性较强的游戏模块（如 2048、贪吃蛇、模拟投资等）。
- `Simulations`：偏规则与物理可视化的实验模块（如生命游戏、混沌摆、粒子生命）。
- `Tools`：实用型处理工具（如图片短字符串编码器）。

目标是将不同类型的想法快速落地为独立页面，同时保持统一的 UI 风格与工程规范。

## 模块地图

| 分区 | 路由 | 当前内容 |
| --- | --- | --- |
| 首页 | `/` | 总览入口，聚合所有模块 |
| Games | `/games` | 2048、函数挂机、贪吃蛇、模拟投资 |
| Simulations | `/simulations` | 生命游戏、兰顿蚂蚁、粒子生命、混沌摆 |
| Tools | `/tools` | 图片短字符串编码 |

### Games

- `/games/Game2048`：多棋盘尺寸、撤销、自动 AI。
- `/games/FunctionIdle`：函数增长主题挂机玩法，支持离线收益。
- `/games/Snake`：经典贪吃蛇，带 AI 接管能力。
- `/games/InvestmentSim`：可视化行情驱动的投资模拟。

### Simulations

- `/simulations/GameOfLife`：康威生命游戏（元胞自动机）。
- `/simulations/LangtonsAnt`：兰顿蚂蚁规则演化。
- `/simulations/ParticleLife`：WebGPU 加速的粒子生命系统。
- `/simulations/PendulumSim`：双摆/三摆混沌运动模拟。

### Tools

- `/tools/ImageStringCodec`：图片编码为短字符串，支持解码还原下载。

## 功能亮点

- 统一的模块化页面组织，便于新增项目和快速扩展。
- 游戏与模拟并行，覆盖规则系统、物理系统与 UI 交互场景。
- 包含 WebGPU（Particle Life）等较高性能图形实验方向。
- 使用 TypeScript 全链路约束，降低迭代时的回归风险。

## 快速开始

### 1) 环境要求

- Node.js `>= 18.18`（建议使用 LTS）
- npm `>= 9`

### 2) 安装依赖

```bash
npm install
```

### 3) 启动开发环境

```bash
npm run dev
```

启动后访问：`http://localhost:3000`

### 4) 构建与运行生产版本

```bash
npm run build
npm run start
```

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动本地开发服务（Turbopack） |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务 |
| `npm run lint` | 执行 ESLint 检查 |
| `npm run test` | 运行 Vitest 测试 |
| `npm run test:watch` | Vitest 监听模式 |

## 项目结构

```text
project-rosmarin/
├─ src/
│  ├─ app/
│  │  ├─ components/      # 通用 UI 组件（如导航）
│  │  ├─ data/            # 项目元数据（games/simulations/tools）
│  │  ├─ games/           # 游戏模块
│  │  ├─ simulations/     # 模拟模块
│  │  └─ tools/           # 工具模块
│  ├─ utils/              # 通用工具函数
│  └─ types/              # 类型声明
├─ tools/                 # 训练或辅助脚本
└─ docs/                  # 项目文档
```

## 技术栈

- 框架：Next.js 15、React 19
- 语言：TypeScript
- 样式：Tailwind CSS 4、Sass、DaisyUI
- 测试：Vitest
- 图形：Canvas、WebGPU（部分模块）

## 许可证

本项目采用 [MIT License](LICENSE)。
