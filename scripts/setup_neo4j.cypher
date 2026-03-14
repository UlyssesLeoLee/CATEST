CREATE CONSTRAINT project_id_unique IF NOT EXISTS FOR (n:Project) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT segment_id_unique IF NOT EXISTS FOR (n:Segment) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT symbol_fq_unique IF NOT EXISTS FOR (n:Symbol) REQUIRE (n.projectId, n.fqName) IS UNIQUE;
