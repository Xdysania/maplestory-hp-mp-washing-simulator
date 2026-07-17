# 冒险岛洗血/扩蓝模拟器

MapleStory 怀旧服 HP/MP Washing Simulator — 模拟从 1 级升级过程中的自然成长、扩蓝与洗血操作，并计算 APR / NX 消耗。

## 快速开始

```bash
cd maplestory-hp-mp-washing-simulator
npm install
npm run dev
```

浏览器访问终端输出的本地地址（默认 `http://localhost:5173`）。

## 构建

```bash
npm run build
npm run preview
```

## 项目结构

```
src/
├── App.jsx              # 主界面（表单 + 仪表盘 + 明细表）
├── config/jobConfig.js  # 职业数据、公式常量
└── utils/simulation.js  # 模拟引擎
```

## 机制说明

- 每次升级获得 5 点新鲜 AP；在扩蓝/洗血区间内，每点 AP 触发一次对应操作并消耗 1 张 APR（3,500 NX）
- MP 扣除后不得低于该等级 Min MP 与用户设定的预留 MP
- 升级自然 MP 增长含 `(基础INT + 装备INT) / 10` 加成；扩蓝智力加成仅计面板基础 INT
