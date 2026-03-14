# CATEST: 分布式 Agentic RAG 代码审校与翻译辅助平台

![GitHub license](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Rust](https://img.shields.io/badge/backend-Rust-orange.svg)
![Next.js](https://img.shields.io/badge/frontend-Next.js-black.svg)
![Agent](https://img.shields.io/badge/orchestrator-LangGraph-green.svg)

**CATEST** 是一款专为**代码审校 (Code Review)** 和**技术文档翻译**设计的分布式、Agent驱动的 RAG (Retrieval-Augmented Generation) 平台。它是通过模块化的知识检索体系，将传统的静态检测升级为具备上下文感知能力的智能助手。

---

## 🚀 核心特性

- **🤖 模块化 Agentic RAG**: 由 **LangGraph** 驱动的意图路由引擎，能够根据代码特征动态调度【术语库 (Term)】、【规则库 (Rule)】、【相似记忆 (Memory/TM)】和【知识图谱 (Graph)】。
- **⚡ 流式知识摄取**: 基于 **Apache Kafka** 和 **Arroyo (SQL Stream)** 的准实时清洗管道，确保新产出的知识能够在毫秒级内被向量化并存入 Qdrant/Neo4j。
- **📝 类 CAT 工作流**: 深度还原专业翻译软件 (Computer-Assisted Translation) 的双栏对照体验，采用 **Next.js + SQLite** 的架构提供极致的本地响应速度。
- **🌐 分布式微服务**: 核心组件均采用 **Rust (Actix-Web)** 编写，保障高并发处理下的数据一致性与系统稳定性。
- **🏗️ 拓扑上下文感知**: 利用 **Neo4j** 构建代码实体间的关联关系，解决 RAG 系统中常见的“孤立代码块”语义缺失问题。

---

## 🛠️ 技术栈

| 层次 | 核心技术 |
| :--- | :--- |
| **前端 (Web)** | Next.js 14 (App Router), Tailwind CSS, LangGraph.js, Lucide React |
| **后端 (Rust)** | Actix-Web, SQLx, rdkafka (Kafka Client), neo4rs (Neo4j Client) |
| **流处理 (Stream)** | Apache Kafka, Arroyo (SQL 流处理引擎) |
| **数据库 (DBs)** | PostgreSQL (业务), Qdrant (向量), Neo4j (图), SQLite (本地缓存) |
| **AI 模型** | Qwen2.5 (本地 Ollama), e5-small (向量化), bge-reranker (重排序) |

---

## 📂 项目结构

```bash
CATEST/
├── crates/             # Rust 微服务核心目录
│   ├── gateway/        # 统一 API 网关 (端口: 33080)
│   ├── ingestion/      # 数据摄取与快照管理
│   ├── parser/         # 基于 Tree-sitter 的代码深度解析
│   ├── embedding/      # 向量化与图谱写入消费者
│   └── common/         # 共享模型与工具包
├── web/                # Next.js 前端门户 (端口: 33000)
├── scripts/            # 基础设施启动与健康检查脚本
├── docs/               # 📚 详细设计文档库 (中文)
└── docker-compose.yml  # 全量基础设施编排 (PG, Kafka, Qdrant, Neo4j, Arroyo)
```

---

## 🚦 快速开始

### 1. 启动基础设施
系统依赖于一系列分布式组件，请确保已安装 Docker。

```bash
docker-compose up -d
```

### 2. 环境变量配置
复制 `.env.example` 到 `.env` 并根据实际环境调整（默认已适配本地 3 系列端口）。

### 3. 启动后端服务 (Rust)
```bash
cargo run --bin gateway
cargo run --bin embedding
# ... 其他微服务根据需要启动
```

### 4. 启动前端
```bash
cd web
npm install
npm run dev
```

---

## 📖 详细设计文档
为了深入了解系统原理，请参阅 `/docs` 目录下的详细设计书籍：
- [01 系统总体架构设计](./docs/01_system_architecture.md)
- [02 网关与身份验证设计](./docs/02_gateway_auth.md)
- [03 数据摄取与流处理管道](./docs/03_ingestion_pipeline.md)
- [04 知识库 (RAG) 存储与检索](./docs/04_knowledge_base_rag.md)
- [05 智能 Agent 与审校逻辑](./docs/05_agent_review_logic.md)

---

## 📄 开源协议
本项目采用 [Apache License 2.0](./LICENSE) 协议。
