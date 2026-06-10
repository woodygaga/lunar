# LUNAR v1.0.3 · 单文件 SPA（合并实验版）

把原本分散的多个 HTML（登录 / 基地 / 3D 驾驶 / 小地图）合并成**单一页面应用**的实验成果。
验证了"多文件 iframe 架构 → 单页 SPA"的可行性。

## 与多文件版（v1.0.2）的关系

- v1.0.2 仍是**主开发分支**（多文件，便于模块隔离开发，直到 demo 完成）
- v1.0.3 是 v1.0.2 在某个时间点的**合并快照**，作为"合并方案已跑通"的存档
- 入口：`index.html`（即合并后的单文件，原 v1.0.2/base-spa.html）

## 架构（单一 JS 世界，零 postMessage）

```
index.html (单文件)
├─ 登录 / 选存档    （原 index.html）
├─ 基地 4 翻页      （原 base.html：仪表盘/相机/仓库/商店）
│   ├─ 相机页监控小窗  ← Three.js 渲染到 #three-stage（叠加定位）
│   └─ 内联小地图      （原 lunar-map.html）
└─ 全屏驾驶模式     （原 outside_new.html：同一 Three.js 实例，换容器+相机模式）
```

合并四阶段：① 合小地图 → ② 合登录 → ③ 合 3D 双视图 → ④ 删尽 postMessage/死代码。

## 资源复用

- 本目录只含小资源：`storage.js`、`inventory.js`、`resource/textures/`（地图图+等高线）
- 大资源（月球 tiles、车模型、地面贴图）**复用 `../v1.0.1/`**，不重复存储

## 运行

项目根起静态服务器后访问 `http://localhost:5173/v1.0.3/index.html`
