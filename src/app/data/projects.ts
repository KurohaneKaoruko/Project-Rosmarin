export interface Project {
  id: string;
  title: string;
  description: string;
  image: string;
  technologies: string[];
  link?: string;
}

export const games: Project[] = [
  {
    id: 'Game2048',
    title: '2048 游戏',
    description: '经典的2048数字方块游戏，使用React和TypeScript实现。通过方向键控制，将相同数字的方块合并，达到2048获胜。',
    image: '/images/2048.png',
    technologies: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
    link: '/games/Game2048'
  },
  {
    id: 'FunctionIdle',
    title: ' 函数挂机游戏',
    description: '指数增长主题的挂机小游戏：升级参数提升增长速度，支持本地存档与离线结算，并提供增长曲线可视化。',
    image: '/images/function-idle.svg',
    technologies: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
    link: '/games/FunctionIdle'
  },
  {
    id: 'Snake',
    title: '贪吃蛇',
    description: '经典贪吃蛇小游戏：支持键盘操作与暂停重开，并提供可一键接管的 AI 玩家（自动寻路与避险策略）。',
    image: '/images/snake.svg',
    technologies: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
    link: '/games/Snake'
  },
  {
    id: 'DanmakuDodge',
    title: '弹幕躲避',
    description: '简约弹幕躲避生存游戏：操控小球在密集弹幕中存活更久，支持 AI 自动躲避与手动切换。',
    image: '/images/bullet-dodge.svg',
    technologies: ['React', 'TypeScript', 'Next.js', 'Canvas'],
    link: '/games/DanmakuDodge'
  },
  {
    id: 'InvestmentSim',
    title: '模拟投资',
    description: '基于时间秒序号的行情模拟投资小游戏，价格每秒更新，历史按 5 分钟间隔展示，支持买卖操作与本地存档，确保所有玩家看到相同价格序列。',
    image: '/images/investment-sim.svg',
    technologies: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
    link: '/games/InvestmentSim'
  },
];

export const simulations: Project[] = [
  {
    id: 'GameOfLife',
    title: '生命游戏 (Game of Life)',
    description: '康威生命游戏：经典的元胞自动机模拟。支持自定义网格大小、速度、颜色主题，可自由绘制初始状态。',
    image: '/images/game-of-life.svg',
    technologies: ['React', 'TypeScript', 'Canvas'],
    link: '/simulations/GameOfLife'
  },
  {
    id: 'LangtonsAnt',
    title: '兰顿蚂蚁 (Langton\'s Ant)',
    description: '经典零玩家游戏：简单的转向规则在混沌后会涌现出稳定的“高速公路”结构。支持多蚂蚁、速度/格子大小调节与手动改图。',
    image: '/images/langtons-ant.svg',
    technologies: ['React', 'TypeScript', 'Canvas'],
    link: '/simulations/LangtonsAnt'
  },
  {
    id: 'ParticleLife',
    title: '粒子生命 (Particle Life)',
    description: '基于 WebGPU 加速的粒子人工生命模拟。数千个粒子根据简单的交互矩阵涌现出复杂的类生命行为。',
    image: '/images/particle-life.svg',
    technologies: ['React', 'WebGPU', 'WGSL', 'TypeScript'],
    link: '/simulations/ParticleLife'
  },
  {
    id: 'PendulumSim',
    title: '混沌摆模拟',
    description: '基于约束物理与数值积分的双摆/三摆模拟：支持拖拽调参，显示轨迹与能量变化曲线。',
    image: '/images/pendulum-sim.svg',
    technologies: ['React', 'TypeScript', 'Next.js', 'Canvas'],
    link: '/simulations/PendulumSim'
  },
];

export const tools: Project[] = [];
