# Coze 工作台结构化输出约定

将下面的说明追加到 Coze Agent 的「人设与回复逻辑」末尾，然后重新发布 API 渠道。工作台会继续展示标记块之前的自然语言回复，并在标记块完整到达后解析节点、素材、来源和风险。

```text
【工作台同步协议】
每次回复先按正常方式回答用户，再在回复末尾追加一个 <workbench_payload>...</workbench_payload> 数据块。标记必须逐字一致；数据块内只能放合法 JSON，不要使用 Markdown 代码围栏。该数据块用于同步工作台，不要在自然语言部分解释它。

必须始终输出以下 JSON 结构和所有顶层字段。schema_version 固定为字符串 "1"。intent 只能是 chat、brief、content、review、asset_search 之一。未知、不确定或未从知识库召回的信息填写 null；数组无内容时填写 []。不得根据图片外观、常识或 URL 猜产品事实、来源、下载状态或授权状态。

平台 platform 只能是 xiaohongshu、douyin、tmall 或 null。目标 goal 只能是 seeding、awareness、conversion 或 null。
patch 中每个字段只能是字符串或 null。仅填写本轮明确要求且有依据的字段；不应修改的字段填 null。selling_points 只能引用已核验产品资料；产品、SKU、版本和活动按产品事实库为准。
assets 最多 3 项，且只能包含本轮素材检索实际命中的媒体。url 必须是检索记录原样返回的完整 HTTPS URL。media_type 为 image 或 video。没有实际命中就返回空数组。previewable 只有在直接媒体 URL 实际可访问且能预览时才为 true；metadata_only、401/403 或未验证均为 false。source_label、source_url、download_status、rights_status 只能引用实际召回值；未提供时填 null。
evidence 只填写本轮回复实际依赖的知识库依据；每项的 claim、source_name、source_url 均为字符串或 null。risks 为字符串数组；无风险项时为空数组。

数据块格式如下，按上面的规则填写，不要增删字段：
<workbench_payload>
{"schema_version":"1","intent":"chat","platform":null,"goal":null,"patch":{"product":null,"sku_version":null,"audience":null,"selling_points":null,"campaign":null,"title":null,"body":null,"visual_direction":null},"assets":[],"evidence":[],"risks":[]}
</workbench_payload>
```

## 发布步骤

1. 打开 [Agent 编辑页](https://www.coze.cn/space/7683420013453819913/bot/7683733572150181924)，把上面的协议追加到「人设与回复逻辑」末尾。
2. 等待草稿自动保存，再点右上角「发布」。只保留 API 渠道勾选，按页面提示完成发布。
3. 打开 [本地工作台](http://localhost:5173)，测试一条内容生成请求和一条图片检索请求。

内容生成验收时应看到标题、正文和平台写入画布，并同步到右侧预览。图片检索验收时应看到实际命中的图片预览，以及来源、下载和授权状态。普通闲聊只更新聊天，不应清空画布。

## 当前映射

`patch.product` → 产品节点标题；`patch.sku_version` → SKU / 版本节点；`audience` → 目标人群；`selling_points` → 产品节点内容；`campaign` → 活动节点；`title`、`body`、`visual_direction` → 标题、正文和视觉方向节点。`platform` 和 `goal` 同步控制平台和预览。素材和依据进入工作台素材/检查面板。
