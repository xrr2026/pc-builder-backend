const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'store.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // 生产环境请用环境变量

// 中间件
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// 静态文件（前台 + 后台）
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// 确保数据文件存在
function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const defaultData = {
      components: {},
      presets: [],
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

// 读取数据
function readData() {
  ensureDataFile();
  const content = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(content);
}

// 保存数据
function saveData(data) {
  ensureDataFile();
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// 管理员密码验证中间件
function requireAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: '密码错误' });
  }
  next();
}

// ============ 公开接口（无需密码）============

// 获取完整数据（前台用）
app.get('/api/data', (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 获取单个配件分类
app.get('/api/components/:category', (req, res) => {
  try {
    const data = readData();
    const category = req.params.category;
    const items = data.components[category] || [];
    res.json({ success: true, data: items });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ 管理接口（需要密码）============

// 验证密码
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, message: '验证成功' });
  } else {
    res.status(401).json({ success: false, message: '密码错误' });
  }
});

// 获取所有配件
app.get('/api/admin/components', requireAuth, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, data: data.components });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 更新整个配件分类
app.put('/api/admin/components/:category', requireAuth, (req, res) => {
  try {
    const { category } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items 必须是数组' });
    }
    const data = readData();
    data.components[category] = items;
    saveData(data);
    res.json({ success: true, message: `${category} 更新成功，共 ${items.length} 条` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 批量更新多个配件分类
app.put('/api/admin/components', requireAuth, (req, res) => {
  try {
    const { components } = req.body;
    const data = readData();
    for (const [category, items] of Object.entries(components)) {
      if (Array.isArray(items)) {
        data.components[category] = items;
      }
    }
    saveData(data);
    res.json({ success: true, message: '配件数据更新成功' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 添加单个配件
app.post('/api/admin/components/:category', requireAuth, (req, res) => {
  try {
    const { category } = req.params;
    const item = req.body;
    if (!item || !item.name) {
      return res.status(400).json({ success: false, message: '配件名称必填' });
    }
    const data = readData();
    if (!data.components[category]) {
      data.components[category] = [];
    }
    if (!item.id) {
      item.id = item.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    }
    const exists = data.components[category].find(i => i.id === item.id);
    if (exists) {
      return res.status(400).json({ success: false, message: `ID ${item.id} 已存在` });
    }
    data.components[category].push(item);
    saveData(data);
    res.json({ success: true, message: '添加成功', item });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 删除配件
app.delete('/api/admin/components/:category/:id', requireAuth, (req, res) => {
  try {
    const { category, id } = req.params;
    const data = readData();
    if (!data.components[category]) {
      return res.status(404).json({ success: false, message: '分类不存在' });
    }
    const index = data.components[category].findIndex(i => i.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: '配件不存在' });
    }
    const removed = data.components[category].splice(index, 1)[0];
    saveData(data);
    res.json({ success: true, message: `已删除: ${removed.name}` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ 方案广场管理 ============

// 获取所有方案
app.get('/api/admin/presets', requireAuth, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, data: data.presets });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 添加/更新方案
app.put('/api/admin/presets', requireAuth, (req, res) => {
  try {
    const { presets } = req.body;
    if (!Array.isArray(presets)) {
      return res.status(400).json({ success: false, message: 'presets 必须是数组' });
    }
    const data = readData();
    data.presets = presets;
    saveData(data);
    res.json({ success: true, message: `方案保存成功，共 ${presets.length} 套` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ 批量导入/导出 ============

// 导出全部数据
app.get('/api/admin/export', requireAuth, (req, res) => {
  try {
    const data = readData();
    res.setHeader('Content-Disposition', `attachment; filename=pc-builder-backup-${Date.now()}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 导入全部数据
app.post('/api/admin/import', requireAuth, (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !data.components) {
      return res.status(400).json({ success: false, message: '无效的数据格式' });
    }
    saveData(data);
    res.json({ success: true, message: '数据导入成功' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 一键同步前台数据
app.get('/api/admin/sync', requireAuth, (req, res) => {
  try {
    const data = readData();
    const code = `// 自动生成，请勿手动修改\nexport const COMPONENTS = ${JSON.stringify(data.components, null, 2)};`;
    res.json({ success: true, code, count: Object.values(data.components).reduce((a, b) => a + b.length, 0) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 所有其他路由（SPA fallback）
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ PC Builder 全栈服务已启动`);
  console.log(`   前台: http://localhost:${PORT}`);
  console.log(`   后台: http://localhost:${PORT}/#/admin`);
  console.log(`   API:  http://localhost:${PORT}/api/`);
  console.log(`   管理密码: ${ADMIN_PASSWORD}`);
  console.log(`   数据文件: ${DATA_FILE}`);
});
