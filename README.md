# CATEST: 分布式 Agentic RAG 代码审校与翻译辅助平台

![GitHub license](https://img.shields.io/badge/license-AGPL--3.0-brightgreen.svg)(https://opensource.org/licenses/AGPL-3.0)
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
| **前端 (Web)** | Next.js 14, Tailwind CSS, LangGraph.js, pnpm |
| **后端 (Rust)** | Actix-Web, SQLx, rdkafka, neo4rs, Tree-sitter |
| **流处理 (Stream)** | Apache Kafka, Arroyo |
| **数据库 (DBs)** | PostgreSQL, Qdrant, Neo4j, SQLite |
| **AI 模型** | Qwen2.5 (Ollama), e5-small, bge-reranker |

---

## 🛠️ 依赖与环境准备 (Prerequisites)

为了成功运行 CATEST，您的本地环境必须具备以下依赖：

### 1. 核心运行环境
- **Docker Desktop**: 建议使用 **WSL 2 后端**。
  - **⚠️ Cgroup v2 依赖**: 部分组件（如 Arroyo）依赖 Linux 的 `cgroup` 资源管理。在 Windows WSL2 中，请确保内核已更新至最新版本。如果遇到容器启动失败，请检查 `/sys/fs/cgroup` 是否为 v2 格式。
  - **安装 Linux 工具**: 在某些精简发行版中，可能需要执行 `sudo apt install cgroupfs-mount` 或 `cgroup-tools`。
- **Rust Toolchain**: 稳定版 (latest stable)。
- **Node.js & pnpm**: Node v18+, pnpm v8+。

### 2. 编译期依赖 (Windows 开发必备)
Rust 的 `rdkafka` 和 `sqlx` (TLS) 需要以下工具：
- **OpenSSL**: 必须安装并配置 `OPENSSL_DIR` 环境变量。建议安装 [Win64 OpenSSL v3.x](https://slproweb.com/products/Win32OpenSSL.html)。
- **CMake**: 编译 Kafka 客户端底层 C 库时需要。
- **LLVM/Clang**: 某些 crate 的 bindgen 过程可能需要。

---

---

## 🏗️ 系统架构 (Architecture)

```mermaid
graph TD
    User((用户/端) -- API --> Gateway[Gateway (crates/gateway)]
    Gateway -- 执行搜索 --> SearchDomain[Search Domain (crates/search-domain)]
    
    subgraph "知识摄取流水线 (NAS-Centric)"
        Ingestion[Ingestion (crates/ingestion)] -- 写入文件 & Manifest --> NAS[(Shared NAS /data/catest)]
        Ingestion -- 发布事件 --> Kafka
        Kafka -- 触发解析 --> Parser[Parser (crates/parser)]
        Parser -- 读取 --> NAS
        Parser -- 向量化/图谱写入 --> SearchDomain
    end

    subgraph "存储层"
        SearchDomain -- 向量索引 --> Qdrant[(Qdrant Vector DB)]
        SearchDomain -- 关系图谱 --> Neo4j[(Neo4j Graph DB)]
        SearchDomain -- 元数据 --> Postgres[(Postgres DB)]
    end

    subgraph "推理层"
        Gateway & SearchDomain -- 嵌入/推理 --> Ollama[Ollama / TEI]
    end
```

### 🏆 架构优化亮点 (Recent Optimizations)
- **共享文件系统 (NAS) 核心**: 弃用 S3 协议，改为直接基于 NAS 的共享存储（/data/catest），利用 `tokio::fs` 实现极速异步 I/O。
- **搜索域解耦 (Domain Logic)**: 独立出 `search-domain` 仓储，集中管理 Qdrant 搜索与 Neo4j 查询，实现 Gateway 的彻底瘦身。
- **全链路异步化**: 全面适配 `async/await`，确保大文件解析不阻塞系统线程。
- **环境配置化**: 通过 `HOST_STORAGE_PATH` 环境变量灵活管理 Windows UNC 或 Linux 宿主机存储路径。

---

## 📂 项目结构

```bash
CATEST/
├── crates/             # Rust 微服务核心目录
│   ├── gateway/        # 统一 API 网关 (端口: 33080)
│   ├── ingestion/      # 数据摄取与快照管理 (NAS 写入)
│   ├── parser/         # 基于 Tree-sitter 的代码深度解析 (NAS 读取)
│   ├── search-domain/  # 搜索领域逻辑 (Qdrant & Neo4j 封装)
│   └── common/         # 共享模型与工具包
├── web/                # Next.js 前端门户 (端口: 33000)
├── scripts/            # 基础设施启动与健康检查脚本
├── docs/               # 📚 详细设计文档库 (中文)
└── docker-compose.yml  # 全量基础设施编排 (NAS 挂载配置化)
```

---

## 🚦 快速开始

### 1. 启动基础设施
```bash
docker-compose up -d
```
> **提示**: 首次启动会拉取大量镜像（Postgres, Kafka, Qdrant, Neo4j, Arroyo），请确保网络通畅。


### 2. 环境变量配置
1. 复制模板：`cp .env.example .env`
2. **启用功能**: 根据需要开启 `ENABLE_OLLAMA` 或 `ENABLE_SMTP`（见 .env.example 中的 Feature Toggles）。
3. **设置密钥**: 必须填写 `JWT_HS256_SECRET` 以保障身份验证正常。

### 3. 启动后端服务 (Rust)
```bash
cargo run --bin gateway
cargo run --bin embedding
# ... 其他微服务根据需要启动
```

### 4. 启动前端
```bash
cd web
pnpm install
pnpm dev
```

---

## 📖 详细设计文档
为了深入了解系统原理，请参阅 `/docs` 目录下的详细设计书籍：
- [01 系统总体架构设计](./docs/01_system_architecture.md)
- [02 网关与身份验证设计](./docs/02_gateway_auth.md)
- [03 数据摄取与流处理管道](./docs/03_ingestion_pipeline.md)
- [04 知识库 (RAG) 存储与检索](./docs/04_knowledge_base_rag.md)
- [05 智能 Agent 与审校逻辑](./docs/05_agent_review_logic.md)
...

## License
This project is licensed under the AGPL-3.0 License.