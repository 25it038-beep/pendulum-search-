"""
HS Knowledge Graph Engine
Maintains structured entity cards, cross-entity relationships, and semantic subgraphs.
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import json
import logging
from typing import List, Dict, Any, Optional
from app.database.connection import db

logger = logging.getLogger(__name__)

INITIAL_ENTITIES = [
    {
        "entity_id": "harshan_seliyan",
        "name": "Harshan Seliyan B S",
        "entity_type": "person",
        "description": "Founder and Chief Architect of HS AI Solutions (HS AI Studio), creator of Pendulum, July LLM, and Gravity LLM.",
        "aliases": ["Harshan", "Harshan Seliyan", "H. Seliyan", "Founder of HS AI Solutions"],
        "metadata": {"role": "Founder", "organization": "HS AI Solutions"},
        "source_url": "https://hs-ai-studio-4i7i.vercel.app/journey",
        "credibility": 1.0
    },
    {
        "entity_id": "hs_ai_solutions",
        "name": "HS AI Solutions",
        "entity_type": "company",
        "description": "AI research and engineering studio focused on autonomous search, July LLM, Gravity LLM, Pendulum, and knowledge retrieval infrastructure.",
        "aliases": ["HS AI", "HS AI Studio", "HS AI Solutions Inc.", "hs-ai-studio-4i7i.vercel.app"],
        "metadata": {"founder": "Harshan Seliyan B S", "headquarters": "India"},
        "source_url": "https://hs-ai-studio-4i7i.vercel.app/",
        "credibility": 1.0
    },
    {
        "entity_id": "hs_search",
        "name": "Pendulum (HS SEARCH)",
        "entity_type": "product",
        "description": "Automated private browser and real-time, AI-powered global search engine with autonomous crawling, hybrid indexing, and verifiable intelligence.",
        "aliases": ["HS Search Engine", "HSSearch", "Pendulum", "Pendulum Search"],
        "metadata": {"technology": "AsyncIO, FTS5, Qdrant, Vector Embeddings", "ai_model": "July LLM"},
        "source_url": "https://hs-ai-studio-4i7i.vercel.app/products/pendulum",
        "credibility": 1.0
    },
    {
        "entity_id": "july_llm",
        "name": "July LLM",
        "entity_type": "technology",
        "description": "Autonomous multi-model CLI and grounded search reasoning engine powering HS SEARCH and HS AI Solutions.",
        "aliases": ["July AI", "July Model", "HS-July-Fast", "Gravity LLM"],
        "metadata": {"organization": "HS AI Solutions", "type": "Language Model"},
        "source_url": "https://hs-ai-studio-4i7i.vercel.app/products/july-llm",
        "credibility": 1.0
    },
    {
        "entity_id": "nvidia",
        "name": "NVIDIA",
        "entity_type": "company",
        "description": "Multinational technology company and global leader in graphics processing units (GPUs) and accelerated computing hardware for AI.",
        "aliases": ["NVIDIA Corporation", "NVDA"],
        "metadata": {"industry": "Semiconductors, Artificial Intelligence"},
        "source_url": "https://www.nvidia.com",
        "credibility": 0.98
    },
    {
        "entity_id": "blackwell",
        "name": "Blackwell",
        "entity_type": "product",
        "description": "Next-generation GPU computing architecture developed by NVIDIA, engineered for trillion-parameter generative AI models and tensor processing.",
        "aliases": ["NVIDIA Blackwell", "B200", "GB200"],
        "metadata": {"manufacturer": "NVIDIA", "architecture": "GPU Architecture"},
        "source_url": "https://www.nvidia.com/blackwell",
        "credibility": 0.98
    },
    {
        "entity_id": "cuda",
        "name": "CUDA",
        "entity_type": "technology",
        "description": "Parallel computing platform and application programming interface model created by NVIDIA for GPU-accelerated computing.",
        "aliases": ["Compute Unified Device Architecture"],
        "metadata": {"developer": "NVIDIA"},
        "source_url": "https://developer.nvidia.com/cuda-zone",
        "credibility": 0.98
    },
    {
        "entity_id": "quantum_computing",
        "name": "Quantum Computing",
        "entity_type": "concept",
        "description": "Rapidly-emerging technology that harnesses the laws of quantum mechanics (superposition and entanglement) to solve complex computational problems.",
        "aliases": ["Quantum Information Science", "Qubits"],
        "metadata": {"field": "Physics, Computer Science"},
        "source_url": "https://en.wikipedia.org/wiki/Quantum_computing",
        "credibility": 0.96
    }
]

INITIAL_RELATIONS = [
    {
        "source_entity_id": "harshan_seliyan",
        "target_entity_id": "hs_ai_solutions",
        "relation_type": "FOUNDED",
        "confidence": 1.0,
        "evidence_snippet": "Harshan Seliyan founded HS AI Solutions to build independent AI search infrastructures."
    },
    {
        "source_entity_id": "hs_ai_solutions",
        "target_entity_id": "hs_search",
        "relation_type": "DEVELOPS",
        "confidence": 1.0,
        "evidence_snippet": "HS AI Solutions develops and operates HS SEARCH."
    },
    {
        "source_entity_id": "hs_search",
        "target_entity_id": "july_llm",
        "relation_type": "POWERED_BY",
        "confidence": 1.0,
        "evidence_snippet": "HS SEARCH is powered by the July LLM intelligence engine."
    },
    {
        "source_entity_id": "nvidia",
        "target_entity_id": "blackwell",
        "relation_type": "PRODUCES",
        "confidence": 0.98,
        "evidence_snippet": "NVIDIA produces the Blackwell GPU computing architecture."
    },
    {
        "source_entity_id": "nvidia",
        "target_entity_id": "cuda",
        "relation_type": "DEVELOPED",
        "confidence": 0.98,
        "evidence_snippet": "NVIDIA developed CUDA for parallel computing."
    },
    {
        "source_entity_id": "blackwell",
        "target_entity_id": "cuda",
        "relation_type": "ACCELERATES",
        "confidence": 0.98,
        "evidence_snippet": "Blackwell hardware accelerates CUDA programming execution."
    }
]

class KnowledgeGraph:
    async def init_seed_graph(self):
        """Seed initial foundational entities and relations."""
        for ent in INITIAL_ENTITIES:
            try:
                await db.upsert_kg_entity(ent)
            except Exception:
                pass

        for rel in INITIAL_RELATIONS:
            try:
                await db.upsert_kg_relation(rel)
            except Exception:
                pass

    async def get_entity_card(self, entity_name_or_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve full entity card with all interconnected relations."""
        entity = await db.get_kg_entity(entity_name_or_id)
        if not entity:
            # Try search
            matches = await db.search_kg_entities(entity_name_or_id, limit=1)
            if matches:
                entity = matches[0]

        if not entity:
            return None

        # Fetch connected relations
        relations = await db.get_kg_relations(entity["entity_id"])
        entity["relations"] = relations
        return entity

    async def search_graph(self, query: str) -> List[Dict[str, Any]]:
        """Search entities matching query."""
        return await db.search_kg_entities(query, limit=5)

knowledge_graph = KnowledgeGraph()
