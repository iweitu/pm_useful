# 🔥一文完全读懂RAG

# 什么是RAG

## 常见RAG过程

![图片展示了RAG（检索增强生成）的工作流程。从左下角的“Raw Data Sources”开始，依次经过“Information Extraction”提取信息，“Chunking”分段，“Embedding”生成向量，再到“Vector Database”存储向量。之后，用户查询“Query”转换为向量，与知识库向量计算相似度，取出片段，与用户查询和片段组织成prompt输入LLM，最后生成回复“Response”。该图直观呈现了RAG从数据准备到生成回复的全过程。](https://feishu.cn/file/GIQ9b3brmoL6A2xkzr2cUPlbnMg)

1. `A->B->C`是构建知识库（索引）的过程：

   1. 首先要将文本划分成片段，然后将片段转换成向量存储到向量数据库中备用，这个向量就是这段文本语义信息的数字表示
2. `1->2`是检索的过程：

   1. 将用户查询转换成和知识库一样的向量表示
   2. 与所有文本片段向量进行相似度计算，取出top k个片段
3. `3->4->5`是增强生成的过程：

   1. 将用户查询和k个文本片段组织成特定prompt格式输入到LLM中，生成回复

## 什么是向量（embedding）

在知识库的创建和检索过程中，我们反复提及了向量：向量就是文本语义、多模态信息的数字表示。

<grid>
<column width-ratio="0.502926">
![图片展示了向量作为多模态信息数字表示的示例。画面中有一组数字向量，周围标注了其对应的多模态信息含义，如颜色的RGB值（235, 52, 30）、形状值（苹果有多扁）、大小值（苹果个头有多大）、纹理值（苹果有多新鲜）。这与上下文提到的向量是文本语义、多模态信息的数字表示相呼应，以更直观的方式解释了向量可对多模态信息进行数字表征的概念。](https://feishu.cn/file/EV25bGaByosI2cxw7TMcVC83nce)
</column>
<column width-ratio="0.497074">
![图片展示了向量在多模态信息中的应用。左侧是一个立方体，内部有不同颜色的点，代表向量数据。右侧展示了四张苹果图片，下方对应着其向量数据。这些向量数据以数字形式呈现，如\[245, 47, 32, 7, ...\]等。图片与上下文的关系是，通过直观示例说明向量是文本语义、多模态信息的数字表示，在知识库创建和检索过程中起到关键作用，帮助大语言模型捕捉词汇间的语义和语法。](https://feishu.cn/file/UlEvbuRKZo8yaixOpvicQlEnnjf)
</column>
</grid>

输入给大模型的词汇都会先转换成向量数据，当训练数据中出现多组类似的语言时在向量数据组成的高维空间相近的词汇就会离的更近，这样大语言模型就可以捕捉到**词汇间的语义和语法。**

比如大模型会很明白苹果、西瓜的语义上接近，但是和公交车相差甚远。

![示意图 @@@@ 图片为一个三维立方体示意图，内部有不同颜色和大小的圆点。红色圆点代表“公交车”，绿色圆点和蓝色圆点分别代表不同类别，其中蓝色圆点中有两个被标注为“西瓜”和“苹果”。此图可能用于展示不同类别事物的分布等相关内容。](https://feishu.cn/file/Iewibd5L3oqOmUx27gLcW7qlnHf)



# 为什么需要RAG

## RAG vs 长上下文模型

### 模型上下文有限：为什么不能无限“喂”长文本？

#### 长上下文模型的致命缺陷

想象你让一个人同时读完一本百科全书再回答问题，他要么崩溃，要么漏掉重点——**大模型处理超长文本时也是如此**。

<sheet sheet-id="xb3WXc" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

#### **案例对比**

- **长上下文模型**：

  - 输入：一篇10万字的医疗研究报告
  - 问题：“第三章节提到的药物副作用是什么？”
  - 结果：模型需从头到尾分析全文，耗时30秒，且可能遗漏细节。
- **RAG**：

  - 输入：同一篇报告存入知识库
  - 问题：“第三章节提到的药物副作用是什么？”
  - 结果：检索系统直接定位“第三章节-副作用”段落，模型仅分析该片段，耗时3秒。

### 成本与速度：为什么大厂“卷不动”长上下文？

#### 算力成本对比（以GPT-4 API为例）

<sheet sheet-id="rf6b6a" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

#### 为什么厂商放弃“内卷”？

1. **边际效益递减**：

   - 当上下文超过10万字（≈100k token），模型理解力不再显著提升。
   - 例如：Claude 3的200k上下文在实际测试中，对后50%内容的召回率下降40%。
2. **RAG的降维打击**：

   - **成本优势**：如OpenAI仅对API用户开放128k版本，因为普通用户用RAG（+分块检索）就能解决99%需求。
   - **技术突破**：BGE Landmark embedding等新技术已解决RAG的检索碎片化问题，精度接近长上下文模型。
3. **用户真实需求**：

   - 99%的场景不需要同时分析整本《哈利波特》，而是快速找到“斯内普教授的结局”。
   - 多模态时代（如视频处理）可能需要更长上下文，但当前算力成本下，RAG仍是性价比之王。

### 总结

<sheet sheet-id="B9RCTN" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

除非未来模型提供更长的上下文，并且降低生成成本和耗时，不然RAG技术还是最适合业务的技术。

## RAG vs SFT

<sheet sheet-id="oroyns" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>



# Retrieval

<callout emoji="🎯">
核心目标：从海量知识中快速筛选与用户问题最相关的片段，为生成阶段提供高质量输入
</callout>

## 【索引阶段】构建知识库

<callout emoji="🤔">
如何让知识更易被“精准召回”？
</callout>

### **上下文中的指代、时间、人物关系处理**

我们拿到的原始知识稿件可能无法直接被使用，比如：

- 直播录屏中的“`一号链接`”对应什么商品？
- 视频ASR中“`我`”“`最近`”去了墨西哥，我是哪个主播？最近是什么时候？
- 视频ASR中“`我的助理`”最近会帮大家进行售后答疑，我的助理是谁？人物关系？

这些模糊的指代需要我们根据业务场景进行消解。

<sheet sheet-id="IJ2Z59" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

### 长文档分块（Chunking）

- **为什么分块？**

  - **长文档场景**：

    - 直接处理整篇文档会导致信息过载，模型难以聚焦关键段落。
    - **案例**：一篇50页的直播运营手册中，用户问“如何提升直播间互动率”，只需召回“互动技巧”章节。
  - **抖音作者场景**：

    - 用户评论分散在视频描述、评论区、私信等位置，分块后可按主题（如“穿搭教程”“产品售后”）快速定位。
- **分块策略**：

<sheet sheet-id="nMCfsy" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

- **优化实践**：

  - **动态分块**：结合规则（如标题分割）与模型（如BERT段落分割）。
  - **元数据标记**：为分块添加标签（如“直播话术-开场白”“产品参数-续航”），便于快速过滤。

### QA对整理（知识结构化）

- **适用场景**：

  - **直播知识库**：用户高频问题（如“如何开通小黄车？”）可直接匹配预设QA对。
  - **抖音创作者帮助中心**：将零散政策条款转化为“问题-答案”形式，提升召回准确率。
- **优势**：

  - **精准匹配**：直接命中用户意图，避免生成阶段二次推理。
  - **可控性高**：答案经过人工审核，减少模型幻觉风险。
- **案例**：

  ```Plain Text
  [问题] 直播间被封禁如何申诉？
  [答案] 步骤：1. 打开抖音APP→2. 进入「我」→3. 点击「设置」→4. 选择「反馈与帮助」→...
  ```

QA对提取也可以结合业务上高频Query分析进行，从而增加问题覆盖。

### 知识图谱

![之前我尝试过用图谱的方式表示AI对用户的记忆](https://feishu.cn/file/REYYbHOfuo7zW8xsxBjcLOs5nrf)

当我们需要跨文档检索时，长文档分Chuck就需要进行分页检索，检索量大且耗时：

<whiteboard token="FZvdwOK9xhoKWdb4iPIcl6UenAh"></whiteboard>

而业务上，我们知道蓝战非的定位是旅游博主，旅游博主的vlog一般和时间、地点强相关，因此我们可以借助大模型，结合时间地点整理稿件通过图谱索引：

<whiteboard token="HtTow19jxhb2avbhSqzc0EGAndd"></whiteboard>

可以看到知识图谱除了可以索引稿件，也能基于图谱本身提供有用信息（比如基于图谱可以直接告诉用户去了西撒哈拉🇪🇭、智利🇨🇱、委内瑞拉🇻🇪三个国家）。

另外图谱化后的子节点稿件由于聚焦于某一个领域，不会太长，因此也可以都输入给大模型，避免检索丢失关键信息。（比如用户深入的问委内瑞拉旅游经历）。

知识图谱也有缺点：需要能准确的从文本中提取实体、关系。对于地名、时间这些通用概念，大模型可以比较好的理解；如果是一些偏僻的概念，比如对用户的记忆，由于大模型不清楚Misakar是一个名字，奶豆是一个宠物狗的称呼，就很容易错误的提取实体，导致生成的知识图谱聚合效果比较差。除了用大模型提取实体，还有[NER（命名实体识别）方法](https://www.jiqizhixin.com/articles/2018-08-31-2)。

### 总结

目前网上关于RAG的资料，大多聚焦于知识整理后的阶段。不过从我们做AI分身（基于作者稿件还原作者知识）业务看，知识整理非常重要，直接影响了后续检索的效率和效果。不过由于知识整理和业务场景强相关，只能具体场景具体分析。这里给出的建议是：

1. **以上三种方法可以同时应用**，通过文档chunk提供基于相似度的检索能力，通过知识图谱提供结构化的检索能力，结合高频用户Query提取QA对提供直接检索能力
2. 利用好**搜索**、**百科**这些公司已经优化好的结构化知识



## 检索方法综述

<callout emoji="🫠">
我想先综合对比下各类检索算法，让大家对每个算法的能力有概念，方便理解接下来的章节
</callout>

### 基础检索方法对比

<sheet sheet-id="46DpLZ" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

在知识库场景，需要模糊检索与上下文相关的文档，因此关键词检索以及向量检索更适合。

### 关键词检索：TF-IDF vs BM25

#### **TF-IDF**

- **核心能力**：基于词频（TF）和逆文档频率（IDF）计算文档相关性。
- **改进点（对比朴素词频）**：惩罚常见词（如“的”、“是”），提升专业词权重。
- **缺点**：

  - ❌ 长文档天然得分高（词频易堆砌）。
  - ❌ 忽略词序和语义（“苹果手机”和“手机苹果”得分相同）。

#### **BM25**

- **核心改进**：

  - **词频饱和度控制**：词频越高，边际收益递减（防止堆砌）。

    - 公式：`有效词频 = (词频 * (k1 + 1)) / (词频 + k1)`（默认k1=1.2）。
    - **示例**：词频=10 → 有效词频≈5.45（而非TF-IDF的10）。
  - **文档长度归一化**：惩罚过长文档，提升短文档公平性。

    - 公式：`长度惩罚因子 = 1 - b + b * (文档长度 / 平均长度)`（默认b=0.75）。
- **优点**：

  - ✅ 更适应真实搜索场景（如电商商品标题）。
  - ✅ 参数可调（k1和b适应不同业务）。
- **通俗例子**：

  - **TF-IDF**：一篇2000字的文章堆砌10次“健康食品”得分高。
  - **BM25**：一篇500字的商品简介出现5次“健康食品”得分更高。

<sheet sheet-id="Fm0kHO" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

### 向量检索：语义相似度匹配

<sheet sheet-id="6cmFmA" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

### 综合对比（BM25 vs BGE-M3 vs 混合检索）

<sheet sheet-id="c0tzAv" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

### 知识库场景选型参考

<readonly-block type="isv"></readonly-block>

### 向量数据库选型参考

我们需要使用支持向量检索的数据库：

<sheet sheet-id="diQ2tM" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

Viking 支持向量+关键词的混合检索：

![图片展示了BM25与向量检索的混合检索流程。左侧为BM25检索流程，关键词检索后与向量检索结果混合排序；右侧为向量检索流程，文档分块后经相似度模型计算向量，再与查询文本计算相似度。两者结合可提升结果相关性、系统集成简单、检索性能提升，适用于电商商品搜索等场景，但存在信息损失、系统复杂度增加、成本上升等问题。](https://feishu.cn/file/EIdmbzLjfof130x55uQcHp7KnWe)

更多关于Viking DB 👉 <cite doc-id="MjYtdl3svogmZTxrNo2cubfrnKh" file-type="docx" title="VikingDB向量数据库--火山引擎" type="doc"></cite>。



## 【检索阶段】构建检索词

<callout emoji="🍺">
核心目标：结合业务场景，构建出能精准反应用户意图的检索词
</callout>

比如下面这段上下文：

![图片展示了RAG检索阶段中Query改写的相关内容。用户提问“国外“国外的我吃溺了”，AI回复“指代替换：类似麦当劳的餐厅”；用户追问“还有什么类似的餐厅吗”，AI回复“错误纠正：吃溺->吃腻”；用户意图是想要了解国内类似麦当劳的餐厅。该图片与上下文紧密相关，直观呈现了Query改写中指代消除、错误纠正等场景，帮助理解Query改写要解决的几类问题题。](https://feishu.cn/file/YSAubrDa5or9hzxsUOccekjWnGh)

如果我们直接拿最后一个用户query：“国外的我吃溺了” 去知识库检索，那准召肯定是很低的。所以要进行Query改写，并构建检索词。

### Query改写要解决的几类问题

<blockquote><p>感谢<cite type="user" user-id="ou_3db72c653eed08bed82081ee5dcfd0e3" user-name="韩建平"></cite>整理</p></blockquote>

#### 指代消除

```Plain Text
用户:汉武帝是谁?
AI:汉武帝是西汉第七位皇帝刘彻。
用户:他做了啥-->汉武帝做了啥
```

#### 省略补全

```Plain Text
AI:我是邱奇遇的AI分身,找我吗?想听听我的流浪故事吗
用户:想-->我想听听你的流浪故事
```

#### 意图还原

```Plain Text
用户:什么粉底液好用
AI:你是什么肤质的呀?干皮、油皮还是混合皮呢?告诉我你的肤质,我来给你推荐哦~
用户:混合-->我是混合肤质什么粉底液好用
```

#### 语义扩展

```Plain Text
原始Query:"深度学习框架安装教程"
改写后:"PyTorch、TensorFlow、Keras安装步骤指南"
```

#### 时空补全

```Plain Text
原始Query:"苹果发布会新品价格"
改写后:"2025年苹果公司iPhone17系列发布会新品价格"
```

时空补全会依赖搜索能力，需要通过搜索让AI知道2025年苹果最新手机型号。所以DeepResearch、Manus类产品在规划前会先搜索，通过搜索返回的结果补全信息和纠错。

#### 多语言归一化

```Plain Text
原始Query:"Transformer结构怎么实现self-attention?"
改写后:"Transformer模型的自注意力机制实现方法"
```

### **构建检索词的核心价值**

1. **精准聚焦用户意图**

- **方法**：从上下文中提取关键词、实体、核心问题，构建简洁的检索词。`原始上下文 = "用户：蜀香阁的招牌菜是什么？"
``构建检索词 = "蜀香阁 招牌菜"  # 去除非关键信息`

  - **案例**：

  - **效果**：召回结果直接关联目标文档中的“菜品介绍”段落，而非泛泛的餐厅信息。

1. **解决指代和省略问题**

- **场景**：用户提问依赖上下文中的隐含信息。`用户：这家餐厅的招牌菜是什么？（上文已提“蜀香阁”）
``构建检索词 = "蜀香阁 招牌菜"  # 补全指代`

  - **案例**：

  - **对比**：若直接搜索“这家餐厅的招牌菜”，可能召回其他无关餐厅的文档。

1. **可控性与可解释性**

- **人工干预**：可通过规则或模型修正检索词，确保对齐业务需求，或者修正错别字

  - **案例**：在医疗场景中，将“我最近头疼”强化为“头疼 病因 诊断标准”，避免召回非专业内容。

### 如何操作

Query改写和检索词提取需要很强的上下文理解能力，是一个生成任务，通过大模型（lite模型能力足够）做比较合适。

可以把需要生成的检索词分为三类：

- **核心词**（必须匹配）：反映用户主要意图
- **扩展词**（建议匹配）：基于用户主要意图的扩展检索词

因此我们可以使用doubao1.5-lite模型，构建如下Prompt：

<table><colgroup><col/><col/></colgroup><tbody><tr><td>Prompt</td><td><pre caption="&#xA;" lang="javascript"><code>你是一个专业的信息检索助手，需要根据用户的消息历史生成两类检索词。请严格按照以下步骤处理：<br/>**输入**：消息历史（多轮对话文本）  <br/>**输出**：JSON格式，包含以下字段：  <br/>{  <br/>    "核心词（必须匹配）"："反映用户主要意图"<br/>    "扩展词（建议匹配）"："基于用户主要意图的扩展检索词"<br/>}<br/><br/>当前时间：2025年3月27日</code></pre></td></tr><tr><td>模型</td><td>doubao1.5-lite-32k</td></tr><tr><td>测试用例</td><td><grid><column width-ratio="0.551606"><img name="image.png" alt="图片展示了一段对话及对应的Prompt信息。用户询问“汉武帝是谁？”，AI回复其为西汉第七位皇帝刘彻。用户接着询问他做了什么，AI给出回复。。return“汉武帝的事迹”“汉武帝的政治举措”“汉武帝的军事成就”“汉武帝的文化政策”等核心词和扩展词。图片下方的Prompt信息中，核心词为“汉武帝的事迹”，扩展词包括政治举措、军事成就成就、文化政策等，还列出了耗时1.35秒、200Tokens、97Characters等数据。该图片与上下" mime="image/png" scale="1.168000" src="WHx2bRnAYodGnRxObZicvxfsnDd"/></column><column width-ratio="0.448394"><img name="image.png" alt="图片展示了一段对话及对应的检索词构建信息。对话中，AI以“我是邱奇遇的AI分身”开场，用户表示想听其流浪故事。下方检索词构建信息显示，核心词为“邱奇遇的流浪故事”，扩展词有“邱奇遇流浪经历、邱奇遇流浪见闻”，排除词为空。该图片与上下文紧密相关，直观呈现了上下文提到的构建检索词时，核心词、扩展词、排除词的具体内容，辅助理解检索词构建过程。" mime="image/png" scale="1.576674" src="HfopbL4oco8U3BxjujFc5Tt8nGe"/></column></grid><grid><column width-ratio="0.433455"><img name="image.png" alt="图片展示了用户与AI的对话及AI生成的检索词构建结果。用户询问什么粉底液好用，AI询问肤质类型，用户回复混合。AI生成的检索词包括“核心词（必须匹配）”为“混合肤质好用的粉底液”，“扩展词（建议匹配）”为“适合混合肤质的持久粉底液、混合肤质遮瑕好的粉底液”，“排除词（必须过滤）”为空。该图片与上下文紧密相关，直观呈现了上下文所述的构建检索词操作示例。" mime="image/png" scale="1.155063" src="KAoyb0GlJoBX93xeiHycsW91nEb"/></column><column width-ratio="0.566545"><img name="image.png" alt="图片展示的是一个关于“深度 自动生成深度学习框架安装教程”的对话界面。用户提问后，图片呈现了模型生成的Prompt内容，包括核心词“深度学习框架安装教程”、扩展词“常见深度学习框架安装步骤、深度学习框架安装注意事项、不同系统下深度学习框架安装”、排除" mime="image/png" scale="0.929936" src="TDwxbyr6koVO0nxP3P8cwhA3nZe"/></column></grid></td></tr><tr><td>耗时优化</td><td>上面是通过fornax测试的。如果走方舟部署，可以应用LoRA 结合的 4bit 或 8bit 量化、缓存等手段，提升推理速度。目前我们线上max是500ms。<br/><b>耗时和输出token数强相关，我们要想办法压缩输出token</b>。比如不输出json，直接输出所有检索词列表。</td></tr></tbody></table>

### 思考：能否借助FunctionCall能力，不单独过Query改写模型

- 单独过Query改写模型：输入 -> `Query改写（大模型）` -> 检索rag -> `大模型` -> 输出
- 通过FunctionCall能力：输入 -> `大模型 -(functioncall)`-> 检索rag -> `大模型（二阶段）` -> 输出

#### 耗时对比

使用豆包pro1.5 functioncall，可以看到在生成函数调用参数环节需要1.79s，相比于直接使用豆包pro-lite模型耗时差不多。

![图片展示了Doubao平台中使用豆包pro1.5模型进行对话调试的记录详情。左侧为调试记录调用树，显示了PromptExecutor、PromptTemplate等节点。右侧是具体运行记录，包含工具、标签、输入、输出等信息，如工具为doubao-1.5-pro-32k，输入为用户提问“用什么样的脉冲时序”，输出为检索到的关键词列表，如“核心关键词”“低频信号的相位调制”等。该图与上下文讨论的通过FunctionCall能力提取检索词的方法耗时相关，直观呈现了运行过程。](https://feishu.cn/file/KYuPbvGf7ohzdWxkev3cpPbNnkc)

不过一次调用模型是有token缓存的，如果上下文较长比如40条的话，会不会耗时上有优化呢🤔 :

当对话历史40条时，基于functioncall提取检索词的方法耗时从1.74s->2.71s。

![图片展示了PromptExecutor的调用树及对话界面。调用树中“doubao-15-pro-32k”节点被红色框突出显示，其下有“retrive_knowledges”节点。对话界面中，Input栏显示了“query”和“MessageType”等信息，右侧Output栏显示了“retrive_knowledges”结果，包含“core_keywords”等字段。该图片与上下文讨论的基于FunctionCall提取检索词的方法耗时相关，直观呈现了相关操作及结果。](https://feishu.cn/file/OvhTbwbOeofBEFxhUFXchYYEn5g)

而基于豆包lite模型的提取方法，耗时则1.88s->2.31s

![图片展示了使用doubao-lite模型进行检索词提取的界面。左侧为Prompt Template，包含系统指令、输入示例、输出示例及JSON格式等内容。右侧是运行区域，显示了用户输入的文本“混合皮粉底液色号选择”，模型输出了检索词，如“混合皮粉底液色号选择”“混合皮粉底液色号搭配”等，还显示了2.31s的耗时、12294Tokens、95 Characters等信息。该图片与上下文讨论的基于doubao-lite模型提取检索词的耗时相关，直观呈现了耗时情况。](https://feishu.cn/file/BfsNbkVRxoqICAx2CjPc93LKn2a)

<callout emoji="🍺">
functioncall方案在耗时上相比于单独过模型并无优势。
</callout>

#### 幻觉

如果rag是强依赖，可以让大模型每次回复必须调用RAG检索函数（通过Prompt，或者langchain封装）

```python
def _get_model():
    # tool_choice="指定调用一个工具"
    # tool_choice="any" # 至少调用一个工具
    return ChatOpenAI(model_name=os.getenv("FZ_MODEL_ENDPOINT"), temperature=0).bind_tools(tools)
```

## 【检索阶段】粗筛 & 精排

<readonly-block type="isv"></readonly-block>

### 分阶段流程的必要性

**召回（Recall） vs 排序（Ranking）**

- **召回阶段**：快速从海量数据（如亿级文档）中筛选出 **可能相关** 的候选集（如Top 1000）。

  - **目标**：覆盖尽可能多的潜在相关结果（高召回率）。
  - **方法**：BM25（关键词）、BGE-M3（语义）、混合召回。
- **排序阶段**：对少量候选集（如Top 1000）精细化排序，选出 **最相关** 的Top 3。

  - **目标**：精准匹配用户意图（高准确率）。
  - **方法**：Reranker（如交叉编码器）、业务规则（如点击率加权）。

**阶段拆解的意义**

- **速度与精度平衡**：

  - BM25/BGE-M3 速度快但精度有限 → 负责“粗筛”。
  - Reranker 速度慢但精度高 → 负责“精排”。
- **资源优化**：

  - Reranker（如BERT）计算成本高，直接处理全量数据不现实 → 只处理Top 1000。

### Reranker模型

在对话场景中，我们需要通过Reranker模型，找出**与对话上下文最相关的TopK个知识**，这就是**Context Reranker**。

说到谁最擅长理解Context--当然是大模型。我们可以借助doubao-lite模型来实现Context Reranker。整体流程如图：

<whiteboard token="OO9pwPGxohp5BKbTOc9cRhZunVd"></whiteboard>

#### max_prompt_tokens=1

- `聚焦极简交互`：Reranker是 “二选一” 类的极简判断任务（如 “是 / 否” 问答），输入仅需一个 token 即可触发模型的核心判断逻辑，限制输入长度可减少无关信息干扰
- `提升计算效率`：减少输入 token 量能降低模型推理耗时，尤其在高频调用场景下，轻量化输入可优化响应速度，同时降低计算资源消耗
- `规范输入格式`：确保输入结构高度统一，避免因复杂 prompt 导致模型输出不稳定，让后续对 top_logprobs的分析更聚焦于目标 token（如 “是”“否”）的概率提取

#### logprobs: true

- **作用**：启用后，模型会返回**每个生成 token 的对数概率**（log probability）。
- **细节**：

  - 对数概率是模型对生成 token 的置信度的量化（自然对数形式），例如 `ln(0.05) ≈ -3`。
  - 若关闭，响应中不会包含任何概率信息。
- **用途**：

  - 分析模型的确定性（例如：高 logprob 表示模型很确定，低则不确定）。
  - 计算生成序列的总概率（用于对比不同生成结果的可靠性）。

#### top_logprobs: 2

- **作用**：返回每个生成位置的前 **2 个最可能候选 token** 及其对数概率。
- **细节**：

  - 除实际生成的 token 外，还会列出该位置概率最高的 **2 个备选 token**。
  - 例如，生成 token 是 `"apple"`（logprob=-4.6），但第二可能的是 `"orange"`（logprob=-5.1）。
- **用途**：

  - 观察模型生成时的“犹豫”情况（例如：前两名 logprobs 接近，说明模型不确定）。
  - 调试生成结果（例如：若实际生成的 token 不在前两名中，可能是高温参数干扰）。

#### 与温度参数的关系

- **高温（`temperature=10`）** 会压低高概率 token 的优势，使生成结果更随机。



#### 伪代码

```python
async def token_logprobs(self, context, cur_question, doc, alpha=0.1,):
    score = -1
    doc_len = len(doc) # doc=知识
    try:
        req = copy.deepcopy(self.req)
        req["messages"] = [
            {
                'role': ChatRole.SYSTEM,
                'content': self.system_prompt
            },
            {
                'role': ChatRole.USER,
                'content': self.user_prompt.format(doc=doc, history=context, query=cur_question)
            }
        ]
        headers = {} # 省略鉴权信息
        payload = json.dumps({}) # 对应流程图中调用模型的参数
        async with aiohttp.ClientSession() as session:
            async with session.post("https://ark-cn-beijing.bytedance.net/api/v3/chat/completions",
                         headers=headers, data=payload, timeout=self.timeout) as response:
                resp = await response.json()
                top_logprobs = resp['choices'][0]['logprobs']['content'][0]['top_logprobs']
                target_token_logprobs = [-float('inf')] * len(self.target_tokens)
                for token_idx, token in enumerate(self.target_tokens):
                    for logprob in top_logprobs:
                        if logprob['token'] == token:
                            target_token_logprobs[token_idx] = float(logprob['logprob'])
                scores = softmax(target_token_logprobs)
                score = np.sum(scores * np.arange(0, len(self.target_tokens))) / (len(self.target_tokens) - 1)
    except Exception as e:
        ......
    return score
```

# 多模态混合检索

我们可以将视频、图片、文本编码到同一个向量空间，这样可以实现混合搜索（比如用文本搜图片）。具体的检索方式和上文介绍的一致。可以参考milvus向量数据库出的[教程](https://github.com/milvus-io/bootcamp/blob/master/bootcamp/tutorials/quickstart/multimodal_rag_with_milvus.ipynb)。

> ps：milvus出了很多向量检索的应用教程：https://milvus.io/zh/bootcamp
>
> ![图片展示了Milvus向量数据库提供的多种应用示例。包括多模态混合检索、Graph RAG图形RAG、Hybrid Search混合搜索、Image Similarity Search图像相似性搜索、Recommender System推荐系统、Video Similarity Search视频相似性搜索、Audio Similarity Search音频相似性搜索、Molecular Similarity Search分子相似性搜索。每种示例均有“Learn More了解更多信息”和“Live Demo 现场演示”按钮，部分示例还配有“Learn More了解更多信息”按钮。这些示例与文档中介绍的Milvus在向量检索应用方面的内容相呼应。](https://feishu.cn/file/DAsSbCb3JoJ2rkx3f22ck1czngf)



# Augmentation & Generation

这部分比较简单。常见做法是把检索出来的知识拼接到Prompt中。特别注意，如果没有知识，也需要补充明确的指令告知模型如何处理。



# 如何评估RAG的效果

## 评价维度

<whiteboard token="ZPD2wMDeZhrzRzbFtgEchv7tnwc"></whiteboard>

## 机评

### RAGAs

RAGAs方法进行评估：[GitHub](https://github.com/explodinggradients/ragas)、[文档](https://docs.ragas.io/en/latest/)、[介绍](https://baoyu.io/translations/rag/evaluating-rag-applications-with-ragas)

RAGAs方法需要我们提供一些问题和问题的答案（GroundTruth）：

<table><colgroup><col/><col/></colgroup><thead><tr><th>Question</th><th>GroundTruth</th></tr></thead><tbody><tr><td>你环球旅行目前到哪个洲了？</td><td>我目前在非洲，科特迪瓦，这里号称西非小巴黎</td></tr><tr><td>你去过哪些洲了？</td><td>我去过亚洲、大洋洲、北美洲、中美洲、南美洲，现在在非洲</td></tr><tr><td>你觉得委内瑞拉怎么样？<blockquote><p>视频：https://www.douyin.com/user/MS4wLjABAAAAn-vTqtfLFPB8S6Q1-8QOxT9w4JhQFSNvFEho_guE2V4?from_tab_name=main&amp;modal_id=7423390724512632104</p></blockquote></td><td>旅行体验很差，从委内瑞拉陆路进入巴西，起初就遇到了签证问题：每次签证的证件照都被拍得像通缉犯一样。到达委内瑞拉的陆路口岸后，办理出境手续时又被卡住，明明有签证却不让出境，理由是必须从进入的口岸出境。经过导游和工作人员长达三个小时的争斗后，最后花了500美元托关系才终于过关。</td></tr></tbody></table>

RAGAs 提供了一些 [指标](https://docs.ragas.io/en/latest/concepts/metrics/index.html)，可用于从组件层面和整体流程两个方面评估 RAG 流程的性能。

在 组件层次 上，RAGAs 提供了评价检索组件（包括 `context_relevancy` 和 `context_recall`）和生成组件（涉及 `faithfulness` 和 `answer_relevancy`）的专门指标：

- [上下文精准度](https://docs.ragas.io/en/latest/concepts/metrics/context_precision.html) 衡量检索出的上下文中有用信息与无用信息的比率。该指标通过分析 `question` 和 `contexts` 来计算。
- [上下文召回率](https://docs.ragas.io/en/latest/concepts/metrics/context_recall.html) 用来评估是否检索到了解答问题所需的全部相关信息。这一指标依据 `ground_truth`（此为框架中唯一基于人工标注的真实数据的指标）和 `contexts` 进行计算。
- [真实性](https://docs.ragas.io/en/latest/concepts/metrics/faithfulness.html) 用于衡量生成答案的事实准确度。它通过对比给定上下文中正确的陈述与生成答案中总陈述的数量来计算。这一指标结合了 `question`、`contexts` 和 `answer`。
- [答案相关度](https://docs.ragas.io/en/latest/concepts/metrics/answer_relevance.html) 评估生成答案与问题的关联程度。例如，对于问题“*法国在哪里及其首都是什么？*”，答案“*法国位于西欧。*”的答案相关度较低，因为它只回答了问题的一部分。

所有指标的评分范围在 [0, 1] 之间，分数越高表示性能越出色。

RAGAs 同样为评估 RAG 流程的 整体流程 提供了指标，例如 [答案的语义相似度](https://docs.ragas.io/en/latest/concepts/metrics/semantic_similarity.html) 和 [答案的正确性](https://docs.ragas.io/en/latest/concepts/metrics/answer_correctness.html)。本文主要讨论的是组件层面的评价指标。

### [亚马逊RAGChecker](https://github.com/amazon-science/RAGChecker/blob/main/tutorial/ragchecker_tutorial_zh.md)

同样需要提供GroundTruth，RAGChecker使用`声明级检查(claim-level checking)`方法进行细粒度评估。以下是其工作原理：

1. **声明抽取（Claim Extraction）**：RAGChecker使用大型语言模型（LLM）作为抽取器，将复杂文本（RAG系统响应和标准答案）分解为单独的声明。声明是一个独立的、原子化的信息片段，可以被验证为真或假。示例：文本："埃菲尔铁塔建于1889年，高324米。" 抽取的声明：

```Plain Text
("埃菲尔铁塔", "建于", "1889年")
("埃菲尔铁塔", "高度", "324米")
```

1. **声明检查（Claim Checking）**: 另一个LLM作为检查器，根据参考文本（检索的上下文或标准答案）验证每个提取的声明的准确性。

![声明级检查](https://feishu.cn/file/GHMfbp3lEom6g6xvPAKcQ8l2nWc)

RAGChecker执行以下比较：

- 回复的声明 vs. 标准答案：衡量回复的正确性。
- 标准答案的声明 vs. 回复：衡量回复的完整性。
- 回复的声明 vs. 检索上下文：衡量忠实度并识别幻觉。
- 标准答案的声明 vs. 检索上下文：评估检索信息的质量。

这些比较是计算RAGChecker中各种指标的基础。

## 人评

和机评指标类似，只是把环节中的模型评价替换为人评价。



# RAG框架调研

## 公司内

### <cite doc-id="LnqYwFgkZiTgEKk7Khjc0EYNnWg" file-type="wiki" title="ByteRAG 统一框架、平台与算子建设" type="doc"></cite>

> ByteRAG是字节内部的统一RAG平台。 RAG作为一种增强搜索以及和LLM结合的技术手段，被广泛应用在各业务线上。不同业务线在RAG能力建设上有相同的诉求：
>
> 1. 稳定、高吞吐的索引构建链路，提供不同的文件解析、chunking、embedding等能力
> 2. 高并发的检索召回链路，提供Query改写、多路召回、Rerank等能力
> 3. 评测能力，能够评估业务效果。 ByteRAG满足了以上的诉求，并且作为统一的RAG平台，方便业务方快速搭建RAG链路，减少无必要的重复造轮子
>
> 目前Coze、Cici和一方应用都已经基于ByteRAG平台上线了相应的RAG链路。ByteRAG提供两种接入方式：
>
> 1. SDK接入：业务方需要自己去管理数据资源、Job资源和Service资源。这种是最灵活的接入方式，业务方可以自定义算子
> 2. 平台服务化接入：ByteRAG平台会负责托管所有的资源，提供最高效快速的接入方式

![图片展示了ByteRAG的架构图，分为业务层和RAG平台层。业务层有Coze、Clic bot等应用。RAG平台层包含召回、排序等多种算子，如Query理解模块、检索模块等。此外，还有计算资源和索引数据存储部分。该图与上文提到的ByteRAG已接入包括Coze、抖音客服等AI产品业务相呼应，直观呈现了ByteRAG的整体架构及各部分的关联，体现其在业务应用中的支撑作用。](https://feishu.cn/file/CG8Kb4trPoS3dGxI0ZhcHWetnxf)

ByteRAG目前已接入包括 Coze、Fornax、抖音客服、猫箱 在内的AI产品业务。

#### Flow Encoder & Flow Reranker

ByteRAG提供了召回和排序算子，（如图，Lark数据集就是一组飞书文档）

![图片展示了ByteRAG召回和排序算子的相关信息。召回算子中，flow_encoder在Lark数据集上效果优于bge_encoder，且支持多语言。排序算子中，flow_ranker在Lark数据集上效果优于bge_reranker，支持多语言。图片与上下文紧密相关，是对ByteRAG提供召回和排序算子这一内容的具体说明，直观呈现了算子在Lark数据集上的评估效果及支持情况。](https://feishu.cn/file/Q8xWb4i78oIsY1xZp1Bc4FpZnBh)

#### Agentic RAG

目前ByteRAG也提供**Agentic RAG**能力，下图节选自ByteRAG介绍文档：

![图片展示了ByteRAG的Agentic RAG能力架构。分为Planning和Reranking两个阶段，Planning阶段包括获取问题、获取答案、获取答案的上下文、获取答案的上下文的上下文、获取答案的上下文的上下文的上下文；Reranking阶段有获取答案、获取答案的上下文、获取答案的上下文的上下文、获取答案的上下文的上下文的上下文。图片还列出了RAG Agent的架构，包括RAG Agent、Task Graph、DAG、LM、RAG Agent的执行流程等。该图与上下文紧密相关，直观呈现了Agentic RAG能力的架构组成。](https://feishu.cn/file/LSwDbHsg6oZDV0xRlaKcdUHdnEc)



## 公司外

### [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG)

![图片展示了LightRAG项目的相关信息。左侧显示“LightRAG Public”标识，右侧有“Watch 115”“Fork 1.9k”“Starred 13.2k”等数据，分别对应关注者、fork次数和星标数量。这些数据直观呈现了项目在GitHub平台上的受欢迎程度，与文档中介绍LightRAG项目的内容相呼应，体现了其在社区的影响力。](https://feishu.cn/file/Pl9JbKxFaoLg5vxqqrfc3TUGnnc)

> 论文：[LIGHTRAG: SIMPLE AND FAST RETRIEVAL-AUGMENTED GENERATION](https://arxiv.org/pdf/2410.05779)

![图片展示了LightRAG框架的整体架构（Figure 1）。左侧是Graph-based Text Indexing，包含D()、P()、R()等操作，以及Entity & Rel Extraction。中间是Deduplication，有Match和Beekeeper等信息。右侧是Index Graph用于检索，有Entity Name、Description等。最右侧是Dual-level Retrieval Paradigm，有Entities、Relations、Contexts等。该图与上下文紧密相关，直观呈现了LightRAG框架从文本索引到检索的全流程。](https://feishu.cn/file/T4mCbRZLfoEreHxkPSYcfCVbnde)

#### 知识库构建链路

通过实体（Entitles）、关系（Relationships）、关联的知识片段（Contexts）的方式索引知识：

![图片展示了HKUDS/LightRAG知识库构建链路。输入文档经Text Chunks提取后，通过Low ER Model嵌入，生成Entities Data和Relations Data。Entities Data包含name、type等，Relations Data有source、target等。这些数据用于更新知识图谱，同时也有向量存储。此外，Entities Data和Relations Data还分别通过Text Enhance和ER Model嵌入，生成更新描述，用于更新知识图谱。该图与上下文紧密相关，直观呈现了知识库构建的流程。](https://feishu.cn/file/VaHEbAlPhoUce1x74gWcjBWVnRb)

#### 知识库检索链路

根据生成的low level检索词和high level检索词两路检索：

![图片展示了HKUDS/LightRAG知识图谱检索与生成的流程。从Query开始，经Local Query Context、Global Query Context等环节，进入Retrieval阶段，通过Local和Global检索词分别检索Local和Global知识库，获取相关实体、关系及Contexts。随后进行Embedding，生成Low和High level Keywords，结合Keywords Extraction Prompt和System Prompt，生成Confined Context，最后通过System Template Prompt和Confined Prompt，完成Response生成。该图与上下文紧密相关，直观呈现了知识图谱检索与生成的各步骤及流程。](https://feishu.cn/file/ASGrbOhwho7psSxmkB6cTuNunVe)

#### 可视化管理

![图片展示了LightRAG知识图谱界面。左侧有知识图谱布局方式选择栏，当前选中“Force Atlas”。界面中部呈现知识图谱，节点以不同颜色标识，如“LLM”“Knowledge Graph”等，节点间有线条连接。右侧为节点详情区域，显示节点ID、标签、属性等信息，如“LLM”节点的描述、名称、类型等。该图与文档中知识库检索链路部分相关，直观呈现了知识图谱的结构与节点信息。](https://feishu.cn/file/Rulgboe54ob44dxpGQocT5trnEe)

#### 使用姿势非常简单

> - `local`：关注依赖上下文的信息
> - `global`：利用全局知识
> - `hybrid`：结合局部和全局检索方法
> - `naive`：执行基本搜索，不使用高级技术
> - `mix`：整合知识图谱和向量检索。Mix 模式结合了知识图谱和向量搜索：
>
>   - 使用结构化（知识图谱）和非结构化（向量）信息
>   - 通过分析关系和上下文提供全面的答案
>   - 支持通过 HTML img 标签的图像内容
>   - 可通过 top_k 参数控制检索深度

```python
import os
import asyncio
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete, gpt_4o_complete, openai_embed
from lightrag.kg.shared_storage import initialize_pipeline_status
from lightrag.utils import setup_logger

setup_logger("lightrag", level="INFO")

async def initialize_rag():
    rag = LightRAG(
        working_dir="your/path",
        embedding_func=openai_embed,
        llm_model_func=gpt_4o_mini_complete
    )

    await rag.initialize_storages()
    await initialize_pipeline_status()

    return rag

def main():
    # Initialize RAG instance
    rag = asyncio.run(initialize_rag())
    # Insert text
    rag.insert("Your text")

    # Perform naive search
    mode="naive"
    # Perform local search
    mode="local"
    # Perform global search
    mode="global"
    # Perform hybrid search
    mode="hybrid"
    # Mix mode Integrates knowledge graph and vector retrieval.
    mode="mix"

    rag.query(
        "What are the top themes in this story?",
        param=QueryParam(mode=mode)
    )

if __name__ == "__main__":
    main()
```

具体Demo可以看这个 [视频](https://www.youtube.com/watch?v=g21royNJ4fw)。

### [infiniflow/ragflow](https://github.com/infiniflow/ragflow)

![图片展示了RAGFlow在GitHub上的项目页面部分信息。左上角有“ragflow”字样及图标，右上角显示该项目的关注者数量为219，分叉数量为4.3k，收藏数量达46.9k 。图片与上文内容相关，上文介绍了RAGFlow是一款开源的RAG引擎，可为企业及个人提供精简的RAG工作流程，此图直观呈现了该项目在平台上的受关注程度等情况。](https://feishu.cn/file/QPTSbgDXCoaHSgx1KFYcEIQpnos)

> [RAGFlow](https://ragflow.io/) 是一款基于深度文档理解构建的开源 RAG（Retrieval-Augmented Generation）引擎。RAGFlow 可以为各种规模的企业及个人提供一套精简的 RAG 工作流程，结合大语言模型（LLM）针对用户各类不同的复杂格式数据提供可靠的问答以及有理有据的引用。

![图片展示了RAG框架的架构图。左侧为用户输入，包括Questions、Documents和File，经Web Nginx处理后，Question和File进入API Server，进行Query Analyze、Task Dispatch等操作。右侧是LLMs、OCR、Document Layout Analyze、Table Structure Recognition等组件，OCR和右侧组件间有Chunk传输。中间部分是Multi - way Recall、Re - rank、Answer等环节，最终Answer返回给用户。该图直观呈现了RAG框架从输入到输出的流程及各组件间关系。](https://feishu.cn/file/NSJObNUhyov1iPx63ElcBec0nFc)

#### 深度文档理解

[深度文档理解（DeepDoc）](https://github.com/infiniflow/ragflow/blob/main/deepdoc/README_zh.md)中有两个组成部分：视觉处理和解析器，视觉处理包括布局识别和表结构识别

布局识别（识别：文本、标题、配图、配图标题、表格、表格标题、页头、页尾、参考引用、公式）

![图片展示了深度文档理解（DeepDoc）中视觉处理的布局识别示例。左侧为文档内容，包含数学公式、表格、段落等结构化信息，如矩阵A的计算公式、表格数据等。右侧为文档的视觉识别结果，以红色框标注了文本、标题、配图、配图标题、表格、表格标题、页头、页尾、参考引用、公式等结构化信息。该图片与上下文紧密相关，直观呈现了深度文档理解中视觉处理对文档结构化信息的识别能力。](https://feishu.cn/file/UW7Tbk5Y6odvfex3Ot3cS0odnte)

表结构识别（识别：列、行、列标题、行标题、合并单元格）

![图片展示了文档中布局识别和表结构识别的示例。左侧为布局识别示例，呈现了文本、标题、配图、配图标题、表格、表格标题、页头、页尾、参考引用、公式等结构化信息。右侧为表结构识别示例，以表格形式呈现了Code Head of Expenditure、Tax Revenue Fees and Charges、Others、Total、Investment and Interest Income/Capital Receipts、Total Receipts等信息，通过红色框线突出显示了列、行、列标题、行标题、合并单元格等结构。该图片与上下文介绍的深度文档理解中视觉处理部分的内容紧密相关，直观呈现了视觉识别文档/表格结构化信息的效果。](https://feishu.cn/file/NCDybfs2WouuCBxewBOcKG8un9e)

通过视觉识别文档/表格中的结构化信息，更好的理解文本的重要性以及关系。

#### RAG工作流

ragflow提供了工作流配置能力，是低代码配置模式：

![图片展示了ragflow提供的低代码配置模式工作流配置界面。界面中有多个蓝色边框的节点，节点内有文字说明，如“Begin Q”“Interface”“categories”等。节点间有蓝色箭头连接，部分节点间有红色箭头连接。右上角有“Run”和“Save”按钮。该图与上下文紧密相关，直观呈现了ragflow工作流配置能力，帮助理解其低代码配置模式下的工作流程设计。](https://feishu.cn/file/SzSmbD8NsokKCkxhrKbcNjDSnje)

### [microsoft/graphrag](https://github.com/microsoft/graphrag)

![图片展示了GraphRAG的GitHub页面部分信息。左侧是GraphRAG的图标及名称，右侧有“Watch”“Fork”“Starred”按钮，分别显示数字165、2.4k、24k，旁边有下拉箭头。该图片与文档中对GraphRAG的介绍相关，直观呈现了其在GitHub上的受欢迎程度，与文档中对GraphRAG作为检索增强生成（RAG）方法的介绍相呼应。](https://feishu.cn/file/XEZSbTSfQo3oGgxccQdcXO5VnHf)

> 论文：[From Local to Global: A GraphRAG Approach to Query-Focused Summarization](https://arxiv.org/pdf/2404.16130)
>
> 检索增强生成（RAG）利用从外部知识源检索相关信息，使大型语言模型（LLMs）能够回答关于私有和/或以前未见过的文档集合的问题。然而，**RAG 在针对整个文本语料库的全局问题上会失败，比如“数据集中的主要主题是什么？”，因为这本质上是一个查询聚焦的摘要（QFS）任务，而不是一个明确的检索任务**。同时，先前的 QFS 方法不能扩展到典型 RAG 系统索引的文本数量。为了结合这些对比方法的优势，我们提出了 GraphRAG，一种基于图的对私有文本语料库进行问答的方法，它随着用户问题的通用性和源文本的数量而扩展。我们的方法使用 LLM 在两个阶段构建图索引：首先，从源文档中推导出实体知识图，然后为所有紧密相关实体的组预生成社区摘要。给定一个问题，每个社区摘要用于生成部分响应，然后在对用户的最终响应中再次总结所有部分响应。对于在 100 万Token范围内的数据集中的一类全局理解问题，我们表明 GraphRAG 在生成答案的全面性和多样性方面比传统的 RAG 基线有实质性的改进。

GraphRAG 是一种结构化、分层的检索增强生成（RAG）方法，与使用纯文本片段的朴素语义搜索方法不同。它从原始文本中提取知识图谱，构建社区层次结构，为社区生成摘要，并在执行基于 RAG 的任务时利用这些结构。与基线 RAG 相比，GraphRAG 在处理复杂信息的问答性能上有显著提升，能更好地处理连接不同信息点以及理解大型数据集或单个大文档的语义概念等问题。

![使用 Leiden 技术对图形执行分层聚类。每个圆圈都是一个实体（例如，一个人、一个地方或一个组织），大小代表实体的程度，颜色代表其社区。](https://feishu.cn/file/DYFJbn32noZxbmx9LKmcfkdpnFf)

GraphRAG 流程包括索引和查询步骤，索引时将输入语料库切片为 TextUnits，提取实体、关系和关键声明，进行层次聚类并生成社区摘要；

查询时有全局搜索、局部搜索和 DRIFT 搜索三种主要模式：

- 全局搜索：通过利用社区摘要对有关语料库的整体问题进行推理
- 局部搜索：通过扇出到特定实体的邻居和相关概念来推理特定实体
- DRIFT搜索：通过扇出到特定实体的邻居和相关概念来搜索有关特定实体的推理，但增加了社区信息的上下文



## 从RAG的演进视角

### Naive RAG -> Advance RAG -> Modular RAG

Naive RAG 表示最简单的实现，其中检索在生成之前发生一次。高级 RAG 引入了更复杂的检索机制，包括多个检索步骤或改进的查询策略。模块化 RAG 是最复杂的方法，它将检索视为一个灵活的组件，可以根据需要在整个生成过程中动态调用，具体见：[介绍](https://medium.com/@drjulija/what-are-naive-rag-advanced-rag-modular-rag-paradigms-edff410c202e)

![图片展示了Naive RAG、Advanced RAG和Modular RAG三种RAG框架的流程图。Naive RAG从用户查询出发，经索引、检索、提示生成输出；Advanced RAG在检索后有预检索和后检索，检索后也有重排、摘要和融合；Modular RAG将检索视为灵活组件，有路由、搜索、检索、重排、重写、演示、记忆、融合等模块，还呈现了三种模式的流程。该图与上下文介绍的RAG演进视角相关，直观呈现了不同框架的差异。](https://feishu.cn/file/NcCubA5b9o4kuExFoaKciLkfnTg)

前面一节介绍的ByteRAG的AgenticRAG我理解就是属于Modular RAG，人类编排的固定Workflow->大模型自主规划的动态Workflow，目的是解决一些更通用的问题。



## 综合对比

<sheet sheet-id="foS6li" token="GCctsjN01hXRlGtietJcXKCtnFd"></sheet>

知识图谱和传统的文档分chunk、提取QA对可以联合使用。文档分chunk覆盖原始稿件中有直接语义的信息，知识图谱覆盖原始稿件中隐含的实体、关系、摘要信息。



# 实战：还原「[蓝战非](https://www.douyin.com/user/MS4wLjABAAAAn-vTqtfLFPB8S6Q1-8QOxT9w4JhQFSNvFEho_guE2V4?from_tab_name=main)旅游vlog」知识

![图片展示了蓝战非](https://feishu.cn/file/UXGXbcQavoBBThxUGzpcHtA0nSh)

<callout emoji="🍺">
蓝战非是抖音上非常出名的主播，目前在环游世界，发了不少vlog，我本人也非常喜欢。
不过主页里面的视频有几百个，并且单个视频一般都在20min左右，想找到我的兴趣点太麻烦了。
**所以我想通过构建知识库，并将知识与视频切片关联起来，通过自然语言对话的方式来检索视频切片，快速找到我的兴趣点！**
</callout>

## 整体思路

### 知识构建

蓝战非的视频形式非常结构化，基本上1、2个视频游完一个国家，游完一个大洲去另一个大洲，所以我们可以按照时间、地点的方式对蓝战非的稿件进行索引。不过视频中往往不会提及时间，所以我们取视频发布时间。

<whiteboard token="PMymw2TelhXOwabSXLBcZcNinwh"></whiteboard>

蓝战非的视频解说很详细，所以ASR中包含很多知识，并且ASR的每句话能和视频的切片时间关联起来：

接口：lab.ocr.video_ocr_v3，ExtractVideoTextsWithVid，会提取ASR以及ASR对应的时间戳

![图片中 addCriterion](https://feishu.cn/file/E7GTbtQrcoPObTxhHumczbIfn5e)

所以我们通过ASR来提取稿件中的知识点，作为视频切片的索引。

### 知识检索

<whiteboard token="P10uwnwlBh0QtDbFSGPcLdK9nwd"></whiteboard>

Demo知识不多，所以不单独做ContextReranker了，直接让大模型来判断。通过Functioncall的形式，构建函数参数就是构建检索词的过程，在函数内部实现知识检索。

## 一步一步搭建

<callout emoji="🍺">
由于链路简单，所以直接使用LangChain搭建RAG链路，使用Milvus向量数据库存储知识。
</callout>

### Step1：获取蓝战非原始稿件，按照时间、地点整理稿件总结知识

由于是Demo，我们只取三个稿件，通过接口获取ASR和对应的视频切片的开始和结束时间

- `7485379082788556069`（vid：v0300fg10000cvgmff7og65ogkflabvg）

  - 2025年3月25日，非洲->纳米比亚🇳🇦-赞比亚🇿🇲-南非🇿🇦

  <source name="7485379082788556069.json" mime="application/json" size="1352215" token="MNrhboF3goVX37xqoJvcIS07nFb"/>
- `7470271833305091354`（vid：v0300fg10000culrk9nog65i68r0lvi0）

  - 2025年2月12日，非洲->埃及🇪🇬

  <source name="7470271833305091354.json" mime="application/json" size="2136511" token="Pikrby4J0o1teUxim6OczJGinBd"/>
- `7446764425131969844`（vid：v0d00fg10000ctc3f7nog65i512nua0g）

  - 2024年12月11日，南美洲->玻利维亚🇧🇴

  <source name="7446764425131969844.json" mime="application/json" size="1103846" token="JVbFbgcTqo045CxgUQ1cZbw6n3H"/>



我们将每个ASR文本和对应的视频切片提取出来：并输入给大模型，让大模型：

1. `提取索引`：大洲、国家、地点
2. `整理内容`：合并相同地点的内容和视频片段

```python
import os
import json
from pathlib import Path
import pickle
from typing import List, Dict

from langchain_core.output_parsers import StrOutputParser, JsonOutputParser
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from langchain_community.embeddings import HuggingFaceEmbeddings
from pymilvus import MilvusClient

class RAGIndexer:
    def __init__(self, collection_name="rag_demo"):
        self.collection_name = collection_name
        self.docs_dir = Path("docs")

        # 初始化大模型
        self.llm = ChatOpenAI(
            model="ep-xxxxxx", # doubao-1.5-pro-256k
            openai_api_key=os.getenv("FZ_API_KEY"),
            openai_api_base=os.getenv("FZ_BASE_URL"),
            temperature=0.7
        )
        self.chain = self.llm | StrOutputParser()

        # 初始化向量数据库
        self.milvus_client = MilvusClient(uri="./mem_milvus.db")

        # 初始化embedding模型
        self.embedding_model = HuggingFaceEmbeddings(
            model_name="BAAI/bge-small-zh",
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True}
        )
        self.embedding_cache = self._load_embedding_cache()
        self.dim = self.embedding_model.client.get_sentence_embedding_dimension()

        # 初始化Milvus集合
        self._init_milvus_collection()

    def _load_embedding_cache(self):
        cache_file = Path("embedding_cache.pkl")
        if cache_file.exists():
            with open(cache_file, "rb") as f:
                return pickle.load(f)
        return {}

    def _save_embedding_cache(self):
        with open("embedding_cache.pkl", "wb") as f:
            pickle.dump(self.embedding_cache, f)

    def _generate_embedding(self, text: str) -> List[float]:
        cache_key = hash(text)
        if cache_key in self.embedding_cache:
            return self.embedding_cache[cache_key]
        vector = self.embedding_model.embed_query(text)
        self.embedding_cache[cache_key] = vector
        return vector

    def _init_milvus_collection(self):
        if not self.milvus_client.has_collection(self.collection_name):
            self.milvus_client.create_collection(
                collection_name=self.collection_name,
                dimension=self.dim,
                primary_field_name="id",
                vector_field_name="vector",
                auto_id=True,
                enable_dynamic_field=True
            )

    def _read_asr_content(self) -> List[Dict]:
        """读取docs目录下的所有ASR内容"""
        asr_contents = []
        for json_file in self.docs_dir.glob("*.json"):
            video_date = json_file.stem
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                tracks = data.get("tracks", [])

                # 处理每个ASR片段
                for i, track in enumerate(tracks):
                    content = {
                        "text": track["text"],
                        "start_time": track["boxes"][0]["timestamp"],
                        "end_time": tracks[i + 1]["boxes"][0]["timestamp"] if i < len(tracks) - 1 else None,
                        "video_date": video_date
                    }
                    asr_contents.append(content)
        return asr_contents

    def _process_with_llm(self, asr_contents: List[Dict]) -> List[Dict]:
        """使用大模型处理ASR内容，提取时间、地点信息并合并相同地点的内容"""
        # 按视频日期分组ASR内容
        grouped_contents = {}
        for content in asr_contents:
            video_date = content["video_date"]
            if video_date not in grouped_contents:
                grouped_contents[video_date] = []
            grouped_contents[video_date].append(content)

        processed_results = []
        # 对每个稿件单独处理
        for video_date, contents in grouped_contents.items():
            prompt = f"""请分析以下视频内容，提取时间、大洲、国家和具体地点信息，并将相同地点的内容合并为一个完整的故事事件。
            注意：
            1. 一个视频中可能有发生在多个地点的故事, 每一项仅包括一个国家、地点的故事
            2. 同一个故事合并连续的片段, 可能包括多个视频片段

            输出格式要求：
            [
                {{
                    "time": "视频日期",
                    "continent": "大洲名称",
                    "country": "国家名称",
                    "location": "具体地点",
                    "content": "合并后的内容描述",
                    "video_segments": [
                        {{
                            "start_time": 开始时间,
                            "end_time": 结束时间
                        }},
                        {{
                            "start_time": 开始时间,
                            "end_time": 结束时间
                        }}
                    ]
                }}
            ]

            视频日期：{video_date}
            视频内容：{contents}
            旅行者：蓝战非
            """

            messages = [HumanMessage(content=[{"type": "text", "text": prompt}])]
            response = self.chain.invoke(messages)

            try:
                processed_content = json.loads(response)
                if isinstance(processed_content, list):
                    processed_results.extend(processed_content)
                else:
                    processed_results.append(processed_content)
            except json.JSONDecodeError:
                print(f"Error parsing LLM response for video date {video_date}: {response}")
                continue

        # 将处理后的内容保存到本地文件
        output_file = Path("processed_content.json")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(processed_results, f, ensure_ascii=False, indent=2)

        return processed_results

    def _store_to_milvus(self):
        """从本地文件读取处理后的内容并存储到Milvus"""
        processed_content_file = Path("processed_content.json")
        if not processed_content_file.exists():
            raise FileNotFoundError("processed_content.json not found. Please run _process_with_llm first.")

        with open(processed_content_file, "r", encoding="utf-8") as f:
            processed_contents = json.load(f)

        for content in processed_contents:
            vector = self._generate_embedding(content["content"])
            data = {
                "vector": vector,
                "time": content["time"],
                "continent": content["continent"],
                "country": content["country"],
                "location": content["location"],
                "video_segments": json.dumps(content["video_segments"]),
                "content": content["content"]
            }
            self.milvus_client.insert(self.collection_name, [data])

    def build_index(self):
        """构建RAG知识库索引的主流程"""
        # 1. 读取ASR内容
        asr_contents = self._read_asr_content()

        # 2. 使用大模型处理内容
        processed_contents = self._process_with_llm(asr_contents)

        # 3. 存储到Milvus
        self._store_to_milvus()

        # 4. 保存embedding缓存
        self._save_embedding_cache()

def main():
    indexer = RAGIndexer()
    indexer.build_index()

if __name__ == "__main__":
    main()
```

整理后的知识：

```json
[
  {
    "time": "2024年12月11日",
    "continent": "南美洲",
    "country": "智利",
    "location": "圣地亚哥",
    "content": "旅行者蓝战非称圣地亚哥物价贵且不好玩，每天担惊受怕被抢。原本可在圣地亚哥的领事馆办理玻利维亚签证，但因印章没墨汁，被要求等半年，后决定前往科皮亚波。",
    "video_segments": [
      {
        "start_time": 8.733333,
        "end_time": 24.733333
      },
      {
        "start_time": 63.733333,
        "end_time": 76.733333
      }
    ]
  },
  {
    "time": "2024年12月11日",
    "continent": "南美洲",
    "country": "智利",
    "location": "阿塔卡马沙漠",
    "content": "旅行者从圣地亚哥出发前往世界极旱之地阿塔卡马沙漠，提及沙漠有些地方400年未下雨。之后因飞机坐反，到达科皮亚波，再坐10小时大巴于晚上10点出发前往卡拉玛，天亮到达。之后前往圣佩德罗镇，这里海拔2500，风景类似中国大西北，全是戈壁滩，有风力发电设施。因旅游自驾需四驱越野车但驾照不符合规定，便找旅行社，旅行社提供包车包吃包住加跨国三天旅游，7天共7500元人民币，但需两人起成团，旅行者交了两份钱。旅行社配的酒店虽破但有露天游泳池。在本地网红美食店品尝三道招牌菜，分别是炸鱿鱼圈沾奶油、洋葱青菜地瓜鲜虾三文鱼沙拉、焖牛肉，花费500元人民币，认为商家是奸商。旅行项目第一站到查克萨盐湖看火烈鸟，看到盐湖盐矿，还看到鸵鸟、羊驼等动物，此处海拔4500，有月亮谷，因除重力外与月球表面一样而得名，附近可能有美国NASA实验基地，很多老外在此等日落，还追了星光，但认为智利旅游消费高且坑。",
    "video_segments": [
      {
        "start_time": 0.733333,
        "end_time": 8.733333
      },
      {
        "start_time": 24.733333,
        "end_time": 59.733333
      },
      {
        "start_time": 94.733333,
        "end_time": 394.733333
      }
    ]
  },
  {
    "time": "2024年12月11日",
    "continent": "南美洲",
    "country": "玻利维亚",
    "location": "玻利维亚大使馆（位于智利卡拉玛附近）",
    "content": "旅行者到达卡拉玛后，前往玻利维亚大使馆办理签证，大使馆难找且冷清，签证费200元人民币，5分钟就办好。",
    "video_segments": [
      {
        "start_time": 57.733333,
        "end_time": 90.733333
      }
    ]
  },
  {
    "time": "2024年12月11日",
    "continent": "南美洲",
    "country": "玻利维亚",
    "location": "玻利维亚海关口岸",
    "content": "旅行者到达玻利维亚海关口岸，认为口岸简陋，感觉偷渡都很容易，之后继续前往天空之境。",
    "video_segments": [
      {
        "start_time": 398.733333,
        "end_time": 415.733333
      }
    ]
  },
  {
    "time": "2024年12月11日",
    "continent": "南美洲",
    "country": "玻利维亚",
    "location": "乌尤尼",
    "content": "旅行者在前往天空之境途中，看到与西藏相似的风景，有颜色神奇的湖泊，湖边有羊驼和火烈鸟。还看到类似游戏画面的奇特地貌。在一个地方发现有中国人开的龙门饭店，价格贵，点了油泼面、饺子和西红柿炒蛋，花费217元人民币，觉得味道不错。之后到达乌优尼网红打卡点火车墓地，打卡后前往乌油尼盐湖，这是世界上最大的盐湖，发现当地人用盐造房子，之后前往盐湖中心的仙人掌岛，看到高大且拟人化的仙人掌，向导准备了午饭。到达天空之境，发现与网络视频有差距，此处韩国人多，日落时开始有天空之境的感觉，还偶遇一对新婚夫妻拍婚纱照。",
    "video_segments": [
      {
        "start_time": 415.733333,
        "end_time": 660.733333
      }
    ]
  },
  {
    "time": "2025年2月12日",
    "continent": "亚洲",
    "country": "中国",
    "location": "广州",
    "content": "旅行者蓝战非开启环球旅行，从广州出发，准备飞往埃及，因行程需乘坐12小时飞机，决定大出血买头等舱，体验后感觉位置宽敞舒适。",
    "video_segments": [
      {
        "start_time": 0,
        "end_time": 18.733333
      }
    ]
  },
  {
    "time": "2025年2月12日",
    "continent": "非洲",
    "country": "埃及",
    "location": "开罗",
    "content": "旅行者蓝战非从广州飞抵埃及开罗，听闻当地骗子多，以自身智商自信应对。办理落地签花费25美金（约180人民币），顺便办5G本地电话卡（74G流量约168人民币）并换了当地货币，吐槽埃及钱看起来劣质。机场打车20公里被收140元，感觉被宰。在市中心花800元一晚定的瓦伦西亚酒店环境差，与国内40元青旅无异，被褥床头发霉，城景房看不到夜景。酒店前台提供的叫车服务价格比打车软件高出10倍。之后去看金字塔，门票100元人民币，现场很多中国人，还看到人面狮身像，体验骑骆驼被套路，坐骆驼和骑马拉都要500元，否则要自己走回去。进入金字塔内部需再花1500埃及磅（约200多人民币），内部看到破棺材。出门坐马车也被坑，说好了500，给600不找零钱，还以面部清洁费为由多要钱。在本地网红店就餐，点了三个招牌菜，有类似绿色芝麻糊的菜、蔬菜炖牛肉、羊腿抓饭，共花费755埃及磅（约110多人民币），评价味道中规中矩，部分菜品有不足。前往开罗塔，花500埃及磅（约70人民币）上去俯瞰开罗，感慨当地旅游文化宣传的古埃及建筑多被阿拉伯式和现代建筑取代，对比中华五千年文化传承的不易。逛哈利利集市，发现与国内网上所传现实版一千零一夜不同，就是普通网红夜市和小商品批发市场，很多商品写着made in China，不敢购买。还介绍了开罗的贫民窟“死人之城”，了解到守墓者职业及他们的生活方式，并非网上所传那么邪乎。垃圾城是收集处理开罗垃圾的地方，味道熏人，居民却习以为常。穿过垃圾城去洞穴教堂，里面还能闻到垃圾城的臭味，打卡后离开。花700元人民币租船游尼罗河，体验不佳，风大冷且水臭，不如游杭州西湖。",
    "video_segments": [
      {
        "start_time": 30.733333,
        "end_time": 588.733333
      }
    ]
  },
  {
    "time": "2025年2月12日",
    "continent": "非洲",
    "country": "埃及",
    "location": "马特鲁",
    "content": "蓝战非花700元人民币包车去埃及北边的马特鲁，司机的车门关不上，车很破旧且车标都没了，但高速修得不错。开了4个小时到达马特鲁，这里靠着地中海，虽城市贫穷破旧，但海岸线很美，海很蓝很清澈，夏天来玩应该不错。又开了8个小时车去盐湖，盐湖景色美如蓝宝石，实测含盐量高达95%，人不会沉下去，上岸后浑身是盐。之后顺着沙漠公路开4个小时到达绿洲城市西瓦，这里与想象中的绿洲不太一样，像吃鸡地图。看到莎莉古堡，是游戏刺客信条取景地，在此可看城市全景。天黑后又饿了，让司机帮忙点正宗本地美食，有鸡肉通心粉、烤牛肉烤鸡腿等。最后跟着本地老外花80元人民币住了一晚，房间大、卫生间干净、有小阳台还送水，床垫不发霉，感觉赚到。",
    "video_segments": [
      {
        "start_time": 588.733333,
        "end_time": 865.733333
      }
    ]
  },
  {
    "time": "2025年2月12日",
    "continent": "非洲",
    "country": "埃及",
    "location": "埃及南部（卢克索等地）",
    "content": "蓝战飞花700人民币一天包车并自己开车前往埃及南边，感觉当地交通法不健全，开了大几百公里没有限速标识和交警。到达卢克索后，看到尼罗河，感觉这里的才是法老时期的尼罗河。参观哈特谢普苏特女王神殿，门票60元人民币，壁画保存较好，打卡后离开。前往帝王谷，这里葬了很多古埃及法老，买了380元人民币最贵的票参观法老塞提一世的墓穴，内部石雕精细，壁画保存精美，因不让进墓穴看葬塞提一世的地方感到可惜。最后在尼罗河看日落，还早起坐热气球看日出。蓝战非表示埃及好玩有意思的东西多，但因骗子多不会再来第二次，在埃及要以恶意揣测每个人才能保护好自己，当地人很多行为都是为了骗钱。",
    "video_segments": [
      {
        "start_time": 865.733333,
        "end_time": 1167.733333
      }
    ]
  },
  {
    "time": "2025年3月25日",
    "continent": "非洲",
    "country": "纳米比亚",
    "location": "纳米比亚",
    "content": "旅行者蓝战非开启环球旅行，计划从安哥拉出发前往纳米比亚，全程两个半小时。到达纳米比亚后，发现该国货币与人民币汇率为1:2.5，但安哥拉货币在此不被接受。他评价纳米比亚城市规划，称其首都人口少，市中心CBD与澳大利亚珀斯相似，并欣赏了城市日落。之后，蓝战非前往一家当地网红店品尝美食，包括剑羚羊、鳄鱼肉、跳脚羚羊肉、猎豹肉、螺旋角羚羊、斑马肉等，对不同肉类的口感进行了评价。因纳米比亚适合自驾游，他凭借国内驾照原件和英文翻译件租了一辆右舵车，先开400公里热身后，前往非洲南部第三大野生动物园艾托莎国家公园。公园门票200元人民币还送地图，但因季节不对，开车5个多小时仅看到几头羚羊、两只鸵鸟、一头水牛、一只小狐狸和一个小鹿群，未见到非洲五霸和长颈鹿。随后，他再开200公里山路前往马拉兰蒂看非洲沙漠巨象，途中抱怨油价贵且柴油比汽油贵，山路难行。到达后发现所谓原始部落村子较为现代，因旅游淡季无人，闻到一股腐烂酸臭味道。之后，他报名老年团找大象，向导开车4个小时却啥都没看到。返程途中遭遇大雨，道路被冲，他凭借两年半越野驾驶经验绕路，却因河水上涨车子翻倒，幸得当地人帮助才脱离困境。最后，他还前往了十字湾海滩、金沙湾、三明治湾等地，十字湾海滩门票100元人民币，这里有大量海豹；金沙湾可参观海豚、鲸鱼、鲨鱼等，船票1000元人民币，船上有粉色鹈鹕，且游客多为中国人；三明治湾一半沙丘一半海。原计划去纳米比亚南部看45号红沙漠，因发大水道路冲毁未能成行，最终决定还车后出发赞比亚。",
    "video_segments": [
      {
        "start_time": 3.733333,
        "end_time": 644.733333
      }
    ]
  },
  {
    "time": "2025年3月25日",
    "continent": "非洲",
    "country": "赞比亚",
    "location": "赞比亚",
    "content": "蓝战非来到赞比亚，深入了解到赞比亚少林寺文化中心收留了一些孤儿和家庭条件不好的孩子，早上教本地文化课，下午学中文，课间学武术，有武术表演活动时会给孩子们买吃喝，他对此表示敬佩。此外，他在当地看到了长颈鹿、猴子、斑马等动物，还乘坐直升机前往世界第三大瀑布、非洲第一大瀑布维多利亚瀑布。",
    "video_segments": [
      {
        "start_time": 644.733333,
        "end_time": 757.733333
      }
    ]
  }
]
```

### Step2：检索知识及其对应切片

```python
import os
from pathlib import Path
import json
from pyexpat.errors import messages
from typing import List, Dict, Optional

from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.prompt import Prompt
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from langchain_openai import AzureChatOpenAI
from pymilvus import MilvusClient
from langchain_community.embeddings import HuggingFaceEmbeddings


class RAGChatbot:
    def __init__(self, collection_name="rag_demo"):
        self.collection_name = collection_name
        self.console = Console()

        # 初始化大模型
        self.llm = AzureChatOpenAI(
            azure_endpoint=os.getenv("AZURE_ENDPOINT"),
            openai_api_key=os.getenv("AZURE_API_KEY"),
            openai_api_version="2023-07-01-preview",
            deployment_name="gpt-4o-2024-08-06",
            temperature=0.7,
        )

        # 初始化向量数据库
        self.milvus_client = MilvusClient(uri="./mem_milvus.db")

        # 初始化embedding模型
        self.embedding_model = HuggingFaceEmbeddings(
            model_name="BAAI/bge-small-zh",
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True}
        )

        # 对话历史
        self.chat_history = []

        # 系统提示词
        self.system_prompt = """你是蓝战非，一个旅游Up主，目前正在环球旅行。
        请根据检索到的视频内容，以友好的口吻回答用户的问题，并且在参考知识的回复后面拼接上视频切片时间video_segments
        如果检索不到相关内容，请诚实地告诉用户。

        你已经去过以下地方:
        {"time": "2024年12月11日", "continent": "南美洲", "country": "智利", "location": "圣地亚哥"},
        {"time": "2024年12月11日", "continent": "南美洲", "country": "智利", "location": "阿塔卡马沙漠"},
        {"time": "2024年12月11日", "continent": "南美洲", "country": "玻利维亚", "location": "玻利维亚大使馆（位于智利卡拉玛附近）"},
        {"time": "2024年12月11日", "continent": "南美洲", "country": "玻利维亚", "location": "玻利维亚海关口岸"},
        """

    def retrieve_rag(self, time: Optional[str] = "", continent: Optional[str] = "", country: Optional[str] = "", location: Optional[str] = "", keywords: Optional[List[str]] = None) -> List[Dict]:
        """从Milvus检索相关知识

        Args:
            time: 视频时间，如果没有则为空字符串
            continent: 大洲名称，如果没有则为空字符串
            country: 国家名称，如果没有则为空字符串
            location: 具体地点，如果没有则为空字符串
            keywords: 核心关键词（反应用户提问意图的词）和扩展检索词 (反应用户潜在意图的词）列表，如果没有则为空列表
        """
        # 构建过滤条件
        filter_conditions = []
        if time:
            filter_conditions.append(f'time == "{time}"')
        if continent:
            filter_conditions.append(f'continent == "{continent}"')
        if country:
            filter_conditions.append(f'country == "{country}"')
        if location:
            filter_conditions.append(f'location == "{location}"')

        expr = " and ".join(filter_conditions) if filter_conditions else ""
        print(f"\n索引: {expr}")
        print(f"\n检索词: {keywords}")

        # 生成检索向量
        keywords = keywords or []
        search_text = " ".join(keywords) if keywords else "蓝战非旅行"
        vector = self.embedding_model.embed_query(search_text)

        # 从Milvus检索
        results = self.milvus_client.search(
            collection_name=self.collection_name,
            data=[vector],
            filter_=expr if expr else None,
            limit=5,
            output_fields=["time", "continent", "country", "location", "content", "video_segments"],
        )

        print("检索结果: ", results)
        return results[0] if results else []

    def chat(self):
        """启动对话"""
        self.console.print(
            Panel.fit(
                Markdown("# 欢迎使用蓝战非旅行视频问答助手\n\n你可以问我关于蓝战非旅行视频的任何问题，我会尽力回答。\n输入'退出'结束对话。"),
                border_style="blue"
            )
        )

        # 绑定检索工具（必须调用retrieve_rag）
        llm_with_rag = self.llm.bind_tools([self.retrieve_rag], tool_choice="retrieve_rag")

        while True:
            query = Prompt.ask("\n[blue]你的问题")

            if query == "退出":
                self.console.print("\n[green]感谢使用，再见！")
                break

            messages = [SystemMessage(content=self.system_prompt)]
            messages.extend(self.chat_history[-20:])  # 保留最近20条对话作为上下文
            messages.append(HumanMessage(content=query))

            # 让大模型调用检索工具
            response = llm_with_rag.invoke(messages)

            # 解析工具调用参数并执行
            if response.tool_calls:
                messages.append(response)
                for tool_call in response.tool_calls:
                    # 执行检索工具调用
                    tool_args = tool_call['args']
                    results = self.retrieve_rag(**tool_args)
                    # 将工具调用结果添加到消息历史
                    messages.append(ToolMessage(
                        tool_call_id=tool_call['id'],
                        content=json.dumps(results, ensure_ascii=False),
                        name=tool_call['name']
                    ))
                    # 让大模型根据检索结果生成最终回复
                    final_response = self.llm.invoke(messages)
                    response = final_response

            # 更新对话历史
            self.chat_history.extend([
                HumanMessage(content=query),
                AIMessage(content=response.content)
            ])

            # 显示回答
            self.console.print(
                Panel(
                    Markdown(response.content),
                    border_style="green",
                    title="[bold]助手回答"
                )
            )

def main():
    chatbot = RAGChatbot()
    chatbot.chat()

if __name__ == "__main__":
    main()
```

## Demo

![图片展示的是一个对话界面，上方提示可询问关于蓝鲸旅行行程的问题。下方显示了大模型的回复，内容为一段JSON格式的数据，包含多个“data”项，每个“data”项下有“date”“entity”“time”“content”“country”“location”“video_segments”等字段，如“date”为“2024/12/11”等。底部有“你是否还有其他问题？”的提示。该图片与上下文紧密相关，是大模型对关于蓝鲸旅行行程问题的回复展示。](https://feishu.cn/file/SCuKbtMpfowgXIx8EsdcfLJAn33)



# 参考信息

- [“Kimi概念”降温，长文本“担不起”大模型的下一步](https://wallstreetcn.com/articles/3711420)
- [从文本到知识图谱：GraphRAG的革命性创新](https://bytetech.info/articles/7460405932775178250?click_from=article_detail_user#L0CudQ7sYoPBMRxQCneciXDOnBg)
- [一文详解深度学习在命名实体识别(NER)中的应用](https://www.jiqizhixin.com/articles/2018-08-31-2)
