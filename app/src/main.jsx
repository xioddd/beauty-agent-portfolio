import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Avatar, Badge, Button, Card, ConfigProvider, Drawer, Empty, Input, Segmented, Select, Spin,
  Space, Tag, Tooltip, Upload, message,
} from 'antd';
import {
  AppstoreOutlined, ArrowRightOutlined, BgColorsOutlined, CalendarOutlined, CheckCircleFilled,
  FileImageOutlined, FileTextOutlined, HeartOutlined, InboxOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, MessageOutlined, MoreOutlined, PaperClipOutlined, PlusOutlined, SendOutlined,
  SearchOutlined, ShopOutlined, SoundOutlined, StarOutlined, UploadOutlined, UserOutlined,
  AimOutlined, TagOutlined, PictureOutlined,
} from '@ant-design/icons';
import './styles.css';
import './category-canvas.css';
import { apiFetch, mediaUrl } from './api.js';

const { TextArea } = Input;
const promptSuggestions = [
  { id: 'brief', text: '帮我完善新品 Brief，并标出还缺哪些产品信息' },
  { id: 'content', text: '根据目标人群和平台，生成内容标题与正文' },
  { id: 'review', text: '检查活动信息、卖点依据和发布素材是否齐全' },
];
const componentTypes = [
  { kind: 'Brief', lane: '新品 Brief', icon: <ShopOutlined />, label: '产品', color: 'blush' },
  { kind: '策略', lane: '内容策略', icon: <AimOutlined />, label: '目标', color: 'blue' },
  { kind: '创作', lane: '内容创作', icon: <SoundOutlined />, label: '文案', color: 'mint' },
  { kind: '适配', lane: '平台适配', icon: <PictureOutlined />, label: '素材', color: 'lilac' },
];
const cardIcons = {
  产品: <ShopOutlined />, 'SKU / 版本': <TagOutlined />, 人群: <UserOutlined />, 依据: <CheckCircleFilled />,
  平台: <MessageOutlined />, 目标: <AimOutlined />, 活动: <CalendarOutlined />, 表达: <SoundOutlined />,
  形式: <AppstoreOutlined />, 文案: <FileTextOutlined />, 视觉: <PictureOutlined />, 素材: <FileImageOutlined />, 校验: <CheckCircleFilled />,
};
const payloadStart = '<workbench_payload>';
const payloadEnd = '</workbench_payload>';
const outputCards = [
  ['product', '新品 Brief', '产品', '产品名称', '产品事实', '产品信息来自知识库或标记待核验', '待核验'],
  ['sku', '新品 Brief', 'SKU / 版本', 'SKU / 版本', '版本核验', '仅填入已核验的 SKU 或版本', '待核验'],
  ['audience', '新品 Brief', '人群', '目标人群', '用户需求', '目标人群待补充', '待补充'],
  ['proof', '新品 Brief', '依据', '卖点依据', '产品事实与溯源', '仅引用知识库返回的事实和来源', '待补充'],
  ['platform', '内容策略', '平台', '目标平台', '内容渠道', '小红书', '已同步'],
  ['goal', '内容策略', '目标', '内容目标', '本次沟通目的', '种草', '已同步'],
  ['campaign', '内容策略', '活动', '活动信息', '活动与权益', '活动规则待核实', '待核实'],
  ['format', '内容创作', '形式', '内容形式', '平台内容形态', '图文笔记', '平台适配'],
  ['headline', '内容创作', '文案', '发布标题', '同步到平台预览', '', '可编辑标题'],
  ['copy', '内容创作', '文案', '正文草稿', '同步到平台预览', '', '演示文案 · 可编辑'],
  ['visual', '内容创作', '视觉', '视觉方向', '平台预览文字', '', '可编辑'],
  ['asset', '平台适配', '素材', '平台素材组', '封面图 · 质地图 · 场景图', '尚未添加素材', '待选择'],
  ['check', '平台适配', '校验', '发布前检查', '平台规范与品牌表达', '核对版本、功效依据、活动权益、素材授权与平台格式。', '发布前检查'],
].map(([id, lane, kind, title, subtitle, body, time]) => ({ id, lane, kind, title, subtitle, body, time }));

function readWorkbenchPayload(raw) {
  const start = raw.indexOf(payloadStart);
  if (start < 0) {
    for (let size = Math.min(raw.length, payloadStart.length - 1); size > 0; size--) {
      if (payloadStart.startsWith(raw.slice(-size))) return { visibleText: raw.slice(0, -size).trimEnd(), payload: null };
    }
    return { visibleText: raw.trimEnd(), payload: null };
  }
  const end = raw.indexOf(payloadEnd, start + payloadStart.length);
  if (end < 0) return { visibleText: raw.slice(0, start).trimEnd(), payload: null };
  try {
    const payload = JSON.parse(raw.slice(start + payloadStart.length, end).trim());
    if (payload.schema_version !== '1' || !['chat', 'brief', 'content', 'review', 'asset_search'].includes(payload.intent)) return { visibleText: raw.trimEnd(), payload: null };
    return { visibleText: raw.slice(0, start).trimEnd(), payload };
  } catch {
    return { visibleText: raw.trimEnd(), payload: null };
  }
}

function App() {
  const [cards, setCards] = useState([]);
  const [platform, setPlatform] = useState('小红书');
  const [goal, setGoal] = useState('');
  const [messages, setMessages] = useState([
    { by: 'assistant', text: '你好，我可以把新品资料和内容需求整理成可编辑企划，并同步到右侧平台预览。' },
  ]);
  const [input, setInput] = useState('');
  const [drawer, setDrawer] = useState('');
  const [dragId, setDragId] = useState(null);
  const [files, setFiles] = useState([]);
  const [collapsed, setCollapsed] = useState({ chat: false, canvas: false, preview: false });
  const [chatWidth, setChatWidth] = useState(340);
  const [previewWidth, setPreviewWidth] = useState(340);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cozeConfigured, setCozeConfigured] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');
  const [conversationId, setConversationId] = useState('');
  const [assetHits, setAssetHits] = useState([]);
  const [agentEvidence, setAgentEvidence] = useState({ items: [], risks: [] });
  const [imageKnowledge, setImageKnowledge] = useState([]);
  const [imageQuery, setImageQuery] = useState('');
  const [imageKnowledgeNote, setImageKnowledgeNote] = useState('');
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [toast, contextHolder] = message.useMessage();

  const checkConnection = async () => {
    setConnectionState('connecting');
    try {
      const response = await apiFetch('/api/health', { signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error('API unavailable');
      const result = await response.json();
      setCozeConfigured(Boolean(result.cozeConfigured));
      setConnectionState(result.cozeConfigured ? 'ready' : 'demo');
    } catch {
      setCozeConfigured(false);
      setConnectionState('offline');
    }
  };
  useEffect(() => { checkConnection(); }, []);

  const updateCard = (id, key, value) => setCards(prev => prev.map(card => card.id === id ? { ...card, [key]: value } : card));
  const togglePane = pane => setCollapsed(prev => ({ ...prev, [pane]: !prev[pane] }));
  const startResize = (side, event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === 'chat' ? chatWidth : previewWidth;
    const onMove = moveEvent => {
      const delta = moveEvent.clientX - startX;
      if (side === 'chat') setChatWidth(Math.min(560, Math.max(300, startWidth + delta)));
      else setPreviewWidth(Math.min(560, Math.max(320, startWidth - delta)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const resizeByKeyboard = (side, event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 12;
    const delta = event.key === 'ArrowRight' ? step : -step;
    if (side === 'chat') setChatWidth(width => Math.min(560, Math.max(300, width + delta)));
    else setPreviewWidth(width => Math.min(560, Math.max(320, width - delta)));
  };
  const moveCard = (targetId) => {
    if (!dragId || dragId === targetId) return;
    setCards(prev => {
      const from = prev.findIndex(card => card.id === dragId);
      const to = prev.findIndex(card => card.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDragId(null);
  };

  const choosePlatform = (value) => {
    setPlatform(value);
    const label = value === '抖音' ? '抖音短视频' : value === '天猫' ? '天猫商品页' : '小红书图文';
    const format = value === '抖音' ? '短视频脚本' : value === '天猫' ? '商品详情页' : '图文笔记';
    setCards(prev => prev.map(card => card.id === 'platform' ? { ...card, title: label, body: value } : card.id === 'format' ? { ...card, body: format } : card));
  };
  const chooseGoal = value => {
    setGoal(value);
    setCards(prev => prev.map(card => card.id === 'goal' ? { ...card, body: value } : card));
  };
  const chooseTone = value => {
    const copyByTone = {
      '生活化表达': '最近在做秋冬面霜功课，我会先确认产品版本，再结合自己的肤感和日常护理习惯慢慢挑。',
      '专业可信': '选购前可先核对产品版本与官方资料，再结合自身肤质、使用习惯和产品说明进行判断。',
      '轻松口语': '挑面霜别急着跟风，先看清版本，再想想自己喜欢什么肤感、平时怎么用。',
      '简洁克制': '先确认产品版本，再依据官方说明和个人需求选择适合的护理方式。',
    };
    setCards(prev => prev.map(card => card.id === 'angle' ? { ...card, body: value } : card.id === 'copy' ? { ...card, body: copyByTone[value] } : card));
  };

  const searchImageKnowledge = async query => {
    setIsSearchingImages(true);
    try {
      const response = await apiFetch('/api/image-knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '图片检索失败');
      setImageKnowledge(result.hits || []);
      setImageKnowledgeNote(result.claimBoundary || '');
    } catch (error) {
      setImageKnowledge([]);
      setImageKnowledgeNote(`图片知识库暂不可用：${error.message}`);
    } finally {
      setIsSearchingImages(false);
    }
  };

  const openAssetLibrary = () => {
    setImageQuery('');
    setDrawer('assets');
    searchImageKnowledge('');
  };

  const addKnowledgeImage = asset => {
    setFiles(prev => [...prev, {
      name: asset.imageId,
      url: mediaUrl(asset.previewUrl),
      type: 'image/jpeg',
      assetId: asset.imageId,
      product: asset.product,
      version: asset.version,
      source: asset.source,
    }]);
    toast.success('图片已加入本次企划');
    setDrawer('');
  };

  const applyMessage = async (text, requestedScenario = 'chat') => {
    if (isGenerating) return;
    if (connectionState === 'connecting' || connectionState === 'offline') {
      toast.info(connectionState === 'connecting' ? '正在连接 API，云端首次唤醒可能需要一分钟。' : 'API 未连接，请点击顶部的重新连接。');
      return;
    }
    const scenario = requestedScenario !== 'chat' ? requestedScenario
      : /检查|核对|是否齐全|风险|校验/.test(text) ? 'review'
        : /生成|标题|正文|内容稿|脚本/.test(text) ? 'content'
          : /完善|brief|Brief|新品资料/.test(text) ? 'brief' : 'chat';
    setInput('');
    setIsGenerating(true);
    setMessages(prev => [...prev, { by: 'user', text }]);
    if (cozeConfigured) {
      const answerIndex = messages.length + 1;
      setMessages(prev => [...prev, { by: 'assistant', text: '' }]);
      try {
        const userIdKey = 'beauty-workbench-user-id';
        let userId = sessionStorage.getItem(userIdKey);
        if (!userId) {
          userId = crypto.randomUUID();
          sessionStorage.setItem(userIdKey, userId);
        }
        const response = await apiFetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, conversationId: conversationId || undefined, userId }),
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Coze API 调用失败');
        }
        if (!response.body) throw new Error('浏览器未提供流式响应');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let answer = '';
        const updateAnswer = value => {
          const { visibleText } = readWorkbenchPayload(value);
          setMessages(prev => prev.map((item, index) => index === answerIndex ? { ...item, text: visibleText || ' ' } : item));
        };
        const processEvent = block => {
          const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
          const dataText = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
          if (!dataText || dataText === '[DONE]') return;
          let data;
          try { data = JSON.parse(dataText); } catch { return; }
          if (event === 'conversation.message.delta' && data.type === 'answer') {
            answer += data.content || '';
            updateAnswer(answer);
          }
          if (event === 'conversation.message.completed' && data.type === 'answer' && !answer) {
            answer = data.content || '';
            updateAnswer(answer);
          }
          const nextConversationId = data.conversation_id || data.conversationId;
          if (nextConversationId) setConversationId(nextConversationId);
          if (event === 'conversation.chat.failed') throw new Error(data.last_error?.msg || 'Coze 对话执行失败');
        };
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';
          for (const block of blocks) processEvent(block);
          if (done) break;
        }
        if (buffer.trim()) processEvent(buffer);
        if (!answer.trim()) {
          updateAnswer('Coze 已完成本轮处理，但没有返回可显示的文本内容。');
        } else {
          const { visibleText, payload } = readWorkbenchPayload(answer);
          updateAnswer(visibleText || answer);
          if (payload && payload.intent !== 'chat') {
            const platformNames = { xiaohongshu: '小红书', douyin: '抖音', tmall: '天猫' };
            const goalNames = { seeding: '种草', awareness: '产品认知', conversion: '转化' };
            const fieldMap = {
              product: ['product', 'title'], sku_version: ['sku', 'body'], audience: ['audience', 'body'],
              selling_points: ['product', 'body'], campaign: ['campaign', 'body'], title: ['headline', 'body'],
              body: ['copy', 'body'], visual_direction: ['visual', 'body'],
            };
            const mapped = Object.entries(fieldMap).flatMap(([key, [id, field]]) => {
              const value = payload.patch?.[key];
              return typeof value === 'string' && value.trim() ? [{ id, field, value: value.trim() }] : [];
            });
            if (mapped.length) {
              setCards(previous => {
                const base = (previous.length ? previous : outputCards).map(card => ({ ...card }));
                for (const item of mapped) {
                  const found = base.find(card => card.id === item.id);
                  if (found) found[item.field] = item.value;
                }
                return base;
              });
            }
            if (platformNames[payload.platform]) setPlatform(platformNames[payload.platform]);
            if (goalNames[payload.goal]) setGoal(goalNames[payload.goal]);
            const validAssets = (Array.isArray(payload.assets) ? payload.assets : []).filter(asset => {
              if (!asset || typeof asset.url !== 'string' || !/^https:\/\//i.test(asset.url)) return false;
              try { return new URL(asset.url).protocol === 'https:'; } catch { return false; }
            }).slice(0, 6).map((asset, index) => ({
              assetId: `coze-${index}-${asset.url}`,
              type: asset.media_type === 'video' ? 'video' : 'image',
              fileName: asset.url.split('/').pop()?.split('?')[0] || 'Coze 检索素材',
              mediaUrl: asset.url,
              sourceTitle: asset.source_label || '来源标签未提供',
              sourceUrl: asset.source_url || '',
              downloadStatus: asset.download_status || '未提供',
              rightsStatus: asset.rights_status || '未提供，需核验',
              previewable: asset.previewable === true,
            }));
            setAssetHits(validAssets);
            const imageFiles = validAssets.filter(asset => asset.type === 'image' && asset.previewable).map(asset => ({
              name: asset.fileName, url: asset.mediaUrl, type: 'image/jpeg', source: asset.sourceTitle,
              rightsStatus: asset.rightsStatus, downloadStatus: asset.downloadStatus,
            }));
            if (imageFiles.length) setFiles(previous => [...previous, ...imageFiles.filter(file => !previous.some(item => item.url === file.url))]);
            if (Array.isArray(payload.evidence) || Array.isArray(payload.risks)) {
              setAgentEvidence({ items: Array.isArray(payload.evidence) ? payload.evidence : [], risks: Array.isArray(payload.risks) ? payload.risks : [] });
            }
          }
        }
      } catch (error) {
        setMessages(prev => prev.map((item, index) => index === answerIndex ? { ...item, text: `Coze 调用失败：${error.message}` } : item));
      } finally {
        setIsGenerating(false);
      }
      return;
    }
    try {
      const response = await apiFetch('/api/brief/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, scenario, platform }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '生成失败，请重试。');
      if (result.scenario !== 'chat') {
        setPlatform(result.platform);
        setGoal(result.goal);
        setCards(result.cards);
        setAssetHits(result.assetHits || []);
      }
      setMessages(prev => [...prev, { by: 'assistant', text: result.assistantText }]);
    } catch (error) {
      setMessages(prev => [...prev, { by: 'assistant', text: `暂时无法生成：${error.message} 请检查 API 服务连接；云端服务首次启动可能需要稍候。` }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const addCard = (lane, kind = '新建') => {
    const id = `card-${Date.now()}`;
    const title = kind === 'Brief' ? '新增产品 / 人群信息' : kind === '策略' ? '新增内容策略' : kind === '创作' ? '新增创作内容' : kind === '适配' ? '新增平台适配项' : '新的内容节点';
    setCards(prev => [...prev, { id, lane, kind, title, subtitle: '企划组件', body: '补充本次企划信息', time: '自定义内容' }]);
    toast.success(`已添加${kind === '新建' ? '内容' : kind}组件`);
  };

  const byLane = useMemo(() => [
    { lane: '新品 Brief', hint: '产品、SKU、人群与卖点依据' },
    { lane: '内容策略', hint: '平台、目标、活动与表达' },
    { lane: '内容创作', hint: '形式、标题、文案与视觉方向' },
    { lane: '平台适配', hint: '素材、规范校验与预览准备' },
  ].map(group => ({ ...group, cards: cards.filter(card => card.lane === group.lane) })), [cards]);

  return <ConfigProvider theme={{ token: { colorPrimary: '#d86e7b', colorText: '#252832', colorBorder: '#e5e8ec', borderRadius: 7, fontFamily: 'Inter, "Microsoft YaHei", sans-serif', controlHeight: 32, fontSize: 12 } }}>
    {contextHolder}
    <div className="shell">
      <header className="topbar">
        <div className="project-line"><Button type="text" className="back">‹</Button><div className="project-title">红宝石面霜双11内容企划（珀莱雅）</div><span className="project-meta">新品内容 · 草稿</span></div>
        <Space size={9}><Tag color={connectionState === 'ready' ? 'green' : connectionState === 'offline' ? 'red' : 'gold'}>{({ connecting: 'API 连接中', ready: 'Coze API 已配置', demo: '规则演示 · 未配置 Coze', offline: 'API 未连接' })[connectionState]}</Tag>{connectionState === 'offline' && <Button onClick={checkConnection}>重新连接</Button>}<Button icon={<InboxOutlined />}>新手引导</Button><Button type="primary" icon={<FileTextOutlined />}>导出内容企划</Button></Space>
      </header>

      <main className="workspace" style={{ gridTemplateColumns: `${collapsed.chat ? 52 : chatWidth}px 6px ${collapsed.canvas ? 52 : 'minmax(0, 1fr)'} 6px ${collapsed.preview ? 52 : previewWidth}px` }}>
        <aside className={`chat-pane ${collapsed.chat ? 'is-collapsed' : ''}`}>
          {collapsed.chat ? <Tooltip title="展开对话" placement="right"><Button type="text" className="collapsed-rail-button" icon={<MenuUnfoldOutlined />} onClick={() => togglePane('chat')} /></Tooltip> : <>
          <div className="chat-head"><div className="chat-brand"><span className="brand-mark"><BgColorsOutlined /></span><span>美妆内容 AI</span></div><Tooltip title="收起对话"><Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={() => togglePane('chat')}>收起</Button></Tooltip></div>
          <div className="chat-conversation" id="chatConversation">
            <div className="conversation-spacer" />
            {messages.map((item, i) => <div className={`message-row ${item.by}`} key={i}>
              {item.by === 'assistant' && <span className="mini-mark"><BgColorsOutlined /></span>}
              <div className="message-bubble">{item.text}</div>
            </div>)}
            {messages.length === 1 && <div className="recommendations">{promptSuggestions.map(prompt => <Button key={prompt.id} className="recommendation-bubble" disabled={isGenerating} onClick={() => applyMessage(prompt.text, prompt.id)}>{prompt.text}<ArrowRightOutlined /></Button>)}</div>}
            {isGenerating && <div className="generation-status"><Spin size="small" /> 正在生成企划节点与平台预览…</div>}
            {assetHits.length > 0 && <div className="asset-search-results"><strong>官方素材命中</strong><div>{assetHits.slice(0, 4).map(asset => <Tag key={asset.assetId} color={asset.type === 'video' ? 'purple' : 'blue'}>{asset.type === 'video' ? '视频' : '图片'} · {asset.fileName || asset.searchText}</Tag>)}</div><Button type="link" size="small" onClick={openAssetLibrary}>查看素材依据</Button></div>}
          </div>
          <div className="chat-bottom">
            {files.length > 0 && <div className="uploaded-files">{files.map((file, index) => <Tag key={`${file.name}-${index}`} closable onClose={() => setFiles(prev => prev.filter((_, fileIndex) => fileIndex !== index))}>{file.name}</Tag>)}</div>}
            <div className="chat-composer"><Upload multiple showUploadList={false} beforeUpload={file => { setFiles(prev => [...prev, { name: file.name, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '', type: file.type }]); return false; }}><Tooltip title="添加图片或文件"><Button type="text" icon={<PaperClipOutlined />} /></Tooltip></Upload><TextArea value={input} onChange={e => setInput(e.target.value)} onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); if (input.trim() && !isGenerating) applyMessage(input.trim()); } }} placeholder="补充内容需求，或调整企划组件…" autoSize={{ minRows: 2, maxRows: 6 }} variant="borderless" /><Button shape="circle" type="primary" icon={<SendOutlined />} loading={isGenerating} onClick={() => input.trim() && !isGenerating && applyMessage(input.trim())} /></div>
          </div>
          </>}
        </aside>
        <div className={`pane-resizer ${collapsed.chat ? 'disabled' : ''}`} role="separator" tabIndex={collapsed.chat ? -1 : 0} aria-label="调整对话栏宽度" aria-orientation="vertical" onKeyDown={event => resizeByKeyboard('chat', event)} onPointerDown={event => !collapsed.chat && startResize('chat', event)} />

        <section className={`canvas-pane ${collapsed.canvas ? 'is-collapsed' : ''}`}>
          {collapsed.canvas ? <Tooltip title="展开企划画布"><Button type="text" className="collapsed-rail-button" icon={<MenuUnfoldOutlined />} onClick={() => togglePane('canvas')} /></Tooltip> : <>
          <div className="floating-tools">
            <Tooltip title="添加企划组件" placement="right"><Button className="tool-trigger" icon={<AppstoreOutlined />} /></Tooltip>
            {componentTypes.map(component => <Tooltip key={component.kind} title={`添加${component.kind}`} placement="right"><Button className={`tool-chip ${component.color}`} onClick={() => addCard(component.lane, component.kind)} icon={component.icon}>{component.label}</Button></Tooltip>)}
          </div>
          <div className="canvas-scroll">
            <div className="canvas-header">
              <div><Tag color="processing">企划画布</Tag><span className="canvas-caption">修改组件，实时预览平台内容</span></div>
              <Space><Button size="small" icon={<PlusOutlined />} onClick={() => addCard('内容创作')}>添加卡片</Button><Tooltip title="收起企划画布"><Button size="small" icon={<MenuFoldOutlined />} onClick={() => togglePane('canvas')} /></Tooltip></Space>
            </div>
            <div className="workflow-steps">
              {byLane.map((group, index) => <div className={`workflow-step stage-${index}`} key={group.lane}><span className="workflow-index">0{index + 1}</span><strong>{group.lane}</strong><span className="workflow-count">{group.cards.length}</span><small>{group.hint}</small></div>)}
            </div>
            {cards.length === 0 ? <div className="canvas-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="画布为空" /><p>运行左侧示例，生成可编辑的企划节点和平台预览。</p><Button type="primary" loading={isGenerating} onClick={() => applyMessage(promptSuggestions[1].text, 'content')}>运行内容生成示例</Button></div> : <div className="lanes">
              {byLane.map((group, laneIndex) => <div className={`lane stage-${laneIndex}`} key={group.lane}>
                <div className="lane-cards">
                  {group.cards.map((card, idx) => <Card key={card.id} size="small" className={`asset-card card-${card.kind}`} draggable onDragStart={() => setDragId(card.id)} onDragEnd={() => setDragId(null)} onDragOver={e => e.preventDefault()} onDrop={() => moveCard(card.id)}>
                    <div className={`card-kicker kicker-${card.kind.replace(/\s*\/\s*/g, '-')}`}><span>{cardIcons[card.kind] || componentTypes.find(item => item.kind === card.kind)?.icon || <StarOutlined />}</span>{card.kind}<Button type="text" size="small" icon={<MoreOutlined />} /></div>
                    {card.id === 'asset' && files.some(file => file.url) && <div className="asset-thumbs"><div style={{ backgroundImage: `url(${files.find(file => file.url)?.url})` }} /></div>}
                    <Input className="card-title-input" value={card.title} onChange={e => updateCard(card.id, 'title', e.target.value)} variant="borderless" />
                    <div className="card-subtitle">{card.subtitle}</div>
                    {card.id === 'platform' ? <Select className="card-select" value={platform} options={['小红书', '抖音', '天猫'].map(value => ({ value, label: value }))} onChange={choosePlatform} /> : card.id === 'goal' ? <Select className="card-select" value={goal} options={['种草', '产品认知', '转化'].map(value => ({ value, label: value }))} onChange={chooseGoal} /> : card.id === 'angle' ? <Select className="card-select" value={card.body} options={['生活化表达', '专业可信', '轻松口语', '简洁克制'].map(value => ({ value, label: value }))} onChange={chooseTone} /> : card.id === 'format' ? <Select className="card-select" value={card.body} options={['图文笔记', '短视频脚本', '商品详情页'].map(value => ({ value, label: value }))} onChange={value => updateCard('format', 'body', value)} /> : <Input.TextArea className="card-body-input" value={card.body} autoSize={{ minRows: 1, maxRows: 3 }} variant="borderless" onChange={e => updateCard(card.id, 'body', e.target.value)} />}
                    {card.id === 'asset' && <>{!files.some(file => file.url) && <div className="asset-empty">尚未选择图片素材</div>}<Button type="link" size="small" icon={<UploadOutlined />} onClick={openAssetLibrary}>选择本次素材</Button></>}
                    {(card.id === 'proof' || card.id === 'check') && <Button type="link" size="small" onClick={() => setDrawer('evidence')}>查看依据与检查项</Button>}
                    <div className="card-time"><span>{card.id === 'asset' ? (files.length ? `${files.length} 项素材已添加` : '尚未添加素材') : card.time}</span><span className="drag-dots">⠿</span></div>
                  </Card>)}
                  {group.cards.length > 0 && <Button type="dashed" className="add-lane-card" icon={<PlusOutlined />} onClick={() => addCard(group.lane)}>添加节点</Button>}
                </div>
              </div>)}
            </div>}
            {cards.length > 0 && <div className="canvas-footer"><Tag bordered={false} color="purple">企划节点 {cards.length}</Tag><span>平台：{platform}</span><span>目标：{goal}</span><span>已上传素材：{files.length}</span></div>}
          </div>
          </>}
        </section>
        <div className={`pane-resizer ${collapsed.preview ? 'disabled' : ''}`} role="separator" tabIndex={collapsed.preview ? -1 : 0} aria-label="调整预览栏宽度" aria-orientation="vertical" onKeyDown={event => resizeByKeyboard('preview', event)} onPointerDown={event => !collapsed.preview && startResize('preview', event)} />

        <aside className={`preview-pane ${collapsed.preview ? 'is-collapsed' : ''}`}>
          {collapsed.preview ? <Tooltip title="展开平台预览" placement="left"><Button type="text" className="collapsed-rail-button" icon={<MenuUnfoldOutlined />} onClick={() => togglePane('preview')} /></Tooltip> : <>
          <div className="preview-header"><strong>内容预览</strong><Tooltip title="收起平台预览"><Button size="small" icon={<MenuFoldOutlined />} onClick={() => togglePane('preview')} /></Tooltip></div>
          <Segmented block value={platform} onChange={choosePlatform} options={['小红书', '抖音', '天猫']} className="platform-switch" />
          {cards.length > 0 && <div className="preview-format"><span>{CardValue(cards, 'format', 'body')}</span><span>{goal}</span></div>}
          <div className={`platform-preview ${platform === '抖音' ? 'douyin' : platform === '天猫' ? 'tmall' : 'xhs'}`}>
            {cards.length === 0 ? <div className="preview-empty"><FileTextOutlined /><strong>尚无预览内容</strong><span>运行左侧示例后，这里会显示{platform}内容。</span></div> : !cards.some(card => ['headline', 'copy'].includes(card.id)) ? <div className="preview-empty"><FileTextOutlined /><strong>Brief 已生成，尚无内容草稿</strong><span>补充内容创作节点后，这里会显示{platform}预览。</span></div> : platform === '小红书' ? <XhsPreview cards={cards} goal={goal} files={files} /> : platform === '抖音' ? <DouyinPreview cards={cards} goal={goal} files={files} /> : <TmallPreview cards={cards} goal={goal} files={files} />}
          </div>
          <div className="preview-actions"><Button type="primary" block icon={<CheckCircleFilled />} onClick={() => setDrawer('evidence')}>查看依据与发布检查</Button></div>
          <div className="preview-map-status"><Badge status="success" text="预览同步中" /><span>{cards.length} 个内容节点</span></div>
          </>}
        </aside>
      </main>
      <Drawer title={drawer === 'assets' ? '本次企划素材' : '内容依据与发布检查'} open={!!drawer} onClose={() => setDrawer('')} width={390}>
        {drawer === 'assets' ? <div className="drawer-assets">
           {files.length ? files.map((file, index) => <div className="drawer-file" key={`${file.name}-${index}`}><FileImageOutlined /><span>{file.name}</span><Tag color="green">已添加</Tag></div>) : <Empty description="尚未添加本地素材" />}
           <section className="image-knowledge-library">
             <div className="image-knowledge-heading"><strong>产品图片知识库</strong><Tag color="blue">演示素材索引 · 10 张</Tag></div>
             <Input.Search value={imageQuery} onChange={event => setImageQuery(event.target.value)} onSearch={searchImageKnowledge} loading={isSearchingImages} allowClear placeholder="搜产品、体验装、套装或版本" enterButton={<SearchOutlined />} />
             {imageKnowledgeNote && <div className="image-knowledge-note">{imageKnowledgeNote}</div>}
             <div className="image-knowledge-results">{imageKnowledge.map(asset => <article className="image-knowledge-item" key={asset.imageId}>
               <img src={mediaUrl(asset.previewUrl)} alt={asset.imageType} loading="lazy" />
               <div className="image-knowledge-meta"><div className="image-knowledge-title"><strong>{asset.product}</strong><Tag color={asset.imageType.includes('组合') || asset.imageType.includes('套装') ? 'purple' : 'cyan'}>{asset.imageType}</Tag></div>
                 <span>{asset.imageId} · SKU：{asset.sku}</span><span>版本：{asset.versionStatus}</span><span>{asset.verification}</span>
                 <a href={asset.sourceUrl} target="_blank" rel="noreferrer">来源：{asset.source}</a>
                 <Button size="small" type="primary" onClick={() => addKnowledgeImage(asset)}>加入本次企划</Button>
               </div>
             </article>)}</div>
           </section>
           {assetHits.length > 0 && <div className="official-asset-list"><strong>官方公开素材检索结果</strong>{assetHits.map(asset => <Card size="small" key={asset.assetId} title={asset.fileName || asset.searchText}><p>{asset.type === 'video' ? '视频元数据' : '图片元数据'} · {asset.downloadStatus || '本地 Demo'}</p><p>来源：{asset.sourceTitle || asset.sourceUrl}</p><p>抓取：{asset.capturedAt} · 授权：{asset.rightsStatus}</p>{asset.mediaUrl && <a href={asset.mediaUrl} target="_blank" rel="noreferrer">打开官方媒体 URL</a>}</Card>)}</div>}
          <Upload multiple showUploadList={false} beforeUpload={file => { setFiles(prev => [...prev, { name: file.name, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '', type: file.type }]); return false; }}><Button icon={<UploadOutlined />}>上传本地素材</Button></Upload>
        </div> : <div className="evidence-list">
          <Card size="small" title="产品事实与来源"><p>{CardValue(cards, 'product', 'title')} · {CardValue(cards, 'sku', 'body')}</p><p>{CardValue(cards, 'product', 'body')}</p><Tag color="orange">演示数据 · 来源待接入</Tag></Card>
          <Card size="small" title="卖点依据"><p>{CardValue(cards, 'proof', 'body')}</p><Tag color="orange">正式发布前核对来源</Tag></Card>
          <Card size="small" title="活动信息"><p>{CardValue(cards, 'campaign', 'body')}</p><Tag color="orange">核实官方活动机制</Tag></Card>
          {agentEvidence.items.map((item, index) => <Card size="small" key={`evidence-${index}`} title={item.claim || item.source_name || `依据 ${index + 1}`}><p>{item.source_name || '来源未提供'}</p>{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">查看来源</a>}</Card>)}
          {agentEvidence.risks.length > 0 && <Card size="small" title="风险提示">{agentEvidence.risks.map((risk, index) => <p key={`risk-${index}`}>{risk}</p>)}</Card>}
          {assetHits.map(asset => <Card size="small" key={asset.assetId} title={asset.fileName}><p>{asset.type === 'video' ? '视频' : '图片'} · 下载：{asset.downloadStatus}</p><p>来源：{asset.sourceTitle}</p><p>授权：{asset.rightsStatus}</p>{asset.mediaUrl && <a href={asset.mediaUrl} target="_blank" rel="noreferrer">打开素材链接</a>}</Card>)}
          <Card size="small" title="发布检查"><p>{CardValue(cards, 'check', 'body')}</p><Tag color="blue">平台预览：{platform}</Tag></Card>
        </div>}
      </Drawer>
    </div>
  </ConfigProvider>;
}

function CardValue(cards, id, field = 'body', fallback = '') { return cards.find(item => item.id === id)?.[field] || fallback; }

function PreviewPlaceholder({ label }) { return <div className="preview-placeholder"><FileImageOutlined /><span>{label}</span></div>; }

function XhsPreview({ cards, goal, files }) {
  const image = files.find(file => file.url)?.url;
  const product = `${CardValue(cards, 'product', 'title', '新品产品')} ${CardValue(cards, 'sku', 'body', '')}`.trim();
  const audience = CardValue(cards, 'audience', 'body', '目标人群');
  const headline = CardValue(cards, 'headline', 'body', '在这里编辑发布标题');
  const copy = CardValue(cards, 'copy', 'body', '在内容创作组件中编辑正文，修改后这里会同步更新。');
  const activity = CardValue(cards, 'campaign', 'body', '活动信息待补充');
  const sellingPoints = CardValue(cards, 'product', 'body', '产品卖点待补充');
  const visual = CardValue(cards, 'visual', 'body', product);
  return <div className="phone-frame xhs-phone"><div className="phone-status"><span>9:41</span><span>•••　◉</span></div><div className="xhs-top"><span>‹</span><Avatar size={25} style={{ background: '#e9c1c0', color: '#8d5557' }}>珀</Avatar><b>珀莱雅品牌号</b><Button size="small" danger>关注</Button><MoreOutlined /></div><div className={`xhs-cover ${image ? '' : 'is-placeholder'}`} style={image ? { backgroundImage: `linear-gradient(90deg,#6c424122,#f1d3cc66),url(${image})` } : undefined}>{!image && <PreviewPlaceholder label="添加产品视觉素材" />}<div className="cover-copy"><span>{audience}</span><strong>{headline}</strong><small>{visual}</small></div></div><div className="xhs-copy"><h3>{headline}</h3><p>{copy}</p><p>{sellingPoints}</p><p>{activity}</p><div className="xhs-tags">#珀莱雅 #面霜功课 #{goal === '转化' ? '活动信息' : '油敏肌护理'}</div><div className="post-meta">赞藏评论　　珀莱雅官方账号</div></div><div className="xhs-bottom"><Input placeholder="说点什么…" size="small" /><HeartOutlined /><StarOutlined /><MessageOutlined /></div></div>;
}

function DouyinPreview({ cards, goal, files }) {
  const image = files.find(file => file.url)?.url;
  const product = `${CardValue(cards, 'product', 'title', '新品产品')} ${CardValue(cards, 'sku', 'body', '')}`.trim();
  const copy = CardValue(cards, 'copy', 'body', '在内容创作组件中编辑短视频口播与字幕文案。');
  const headline = CardValue(cards, 'headline', 'body', '编辑短视频标题');
  const audience = CardValue(cards, 'audience', 'body', '目标人群');
  const sellingPoints = CardValue(cards, 'product', 'body', '产品卖点待补充');
  const visual = CardValue(cards, 'visual', 'body', product);
  return <div className="phone-frame douyin-phone"><div className={`video-scene ${image ? '' : 'is-placeholder'}`} style={image ? { backgroundImage: `linear-gradient(0deg,#0c0c0dd9 0%,transparent 63%),url(${image})` } : undefined}>{!image && <PreviewPlaceholder label="添加视频封面素材" />}<div className="video-top">直播　同城　关注　<span>推荐</span></div><div className="video-play">▶</div><div className="video-side"><Avatar size={35} style={{ background: '#d97983' }}>珀</Avatar><HeartOutlined /><MessageOutlined /><StarOutlined /><ShareAltIcon /></div><div className="video-caption"><b>珀莱雅品牌号</b><p>{copy}</p><small>{audience}</small><Tag color="magenta">{product}</Tag><small>{sellingPoints}</small><small>{visual} · {headline} · {goal}</small></div><div className="video-bottom"><span>首页</span><span>朋友</span><span className="video-create">＋</span><span>消息</span><span>我</span></div></div></div>;
}

function ShareAltIcon() { return <span className="share-glyph">↗</span>; }

function TmallPreview({ cards, goal, files }) {
  const image = files.find(file => file.url)?.url;
  const product = `${CardValue(cards, 'product', 'title', '新品产品')} ${CardValue(cards, 'sku', 'body', '')}`.trim();
  const sellingPoints = CardValue(cards, 'product', 'body', '产品卖点待补充');
  const copy = CardValue(cards, 'copy', 'body', '在内容创作组件中编辑商品详情文案。');
  const activity = CardValue(cards, 'campaign', 'body', '活动信息待补充');
  return <div className="tmall-page"><div className="tmall-brand"><span>天猫</span><b>珀莱雅旗舰店</b><MoreOutlined /></div><div className={`tmall-photo ${image ? '' : 'is-placeholder'}`} style={image ? { backgroundImage: `linear-gradient(0deg,#6a263044,#ffffff00),url(${image})` } : undefined}>{!image && <PreviewPlaceholder label="添加商品主图素材" />}<div>PROYA<br /><strong>{product}</strong><small>{sellingPoints}</small></div></div><div className="tmall-info"><Tag color="red">官方旗舰店</Tag><h3>{product}</h3><p>{copy}</p><div className="tmall-price">{activity}</div><div className="tmall-tags"><Tag>产品信息</Tag><Tag>规格选择</Tag><Tag>官方说明</Tag></div><Button type="primary" block>{goal === '转化' ? '查看官方活动' : '了解产品信息'}</Button></div></div>;
}

createRoot(document.getElementById('root')).render(<App />);
