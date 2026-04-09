#!/usr/bin/env python3
"""
Generate local Smart Library original editions for every book in the catalog.

This script does not copy third-party book text. It creates fresh, locally stored
educational HTML pages based only on catalog metadata such as title, author, and
library name, then updates `books.read_online_url` to point at those local files.
"""

from __future__ import annotations

import argparse
import html
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT_DIR / "original_books"
CSS_PATH = OUTPUT_DIR / "original-books.css"
INDEX_PATH = OUTPUT_DIR / "index.html"


def load_local_env_file() -> None:
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return

    with env_path.open("r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


@dataclass(frozen=True)
class TopicProfile:
    name: str
    keywords: tuple[str, ...]
    focus: str
    concepts: tuple[str, ...]
    habits: tuple[str, ...]
    project: str
    reflection: tuple[str, ...]


TOPIC_PROFILES: tuple[TopicProfile, ...] = (
    TopicProfile(
        name="algorithms",
        keywords=("algorithm", "algorithms", "complexity", "search", "sort"),
        focus="algorithmic thinking and step-by-step problem solving",
        concepts=("correctness", "efficiency", "trade-offs", "input size", "proof strategy"),
        habits=("trace small examples", "compare multiple approaches", "measure runtime honestly"),
        project="Design a routine that solves one repeated campus problem using clear inputs, outputs, and edge cases.",
        reflection=("What makes a solution elegant?", "When should speed matter more than simplicity?", "How do you test worst-case behavior?"),
    ),
    TopicProfile(
        name="data-structures",
        keywords=("data structure", "stack", "queue", "tree", "graph", "hash", "linked"),
        focus="organizing data so operations stay predictable and maintainable",
        concepts=("layout", "access pattern", "mutation cost", "memory model", "invariants"),
        habits=("draw the structure before coding it", "track insert and delete rules", "watch how data changes over time"),
        project="Model a mini library shelf, waitlist, or reservation workflow using two different structures and compare them.",
        reflection=("Which structure matches the problem's shape?", "What update is most expensive?", "Where can invariants break?"),
    ),
    TopicProfile(
        name="machine-learning",
        keywords=("machine", "learning", "neural", "ai", "intelligence", "deep"),
        focus="teaching machines to detect patterns while humans keep the goals and limits clear",
        concepts=("data quality", "features", "training loop", "generalization", "evaluation"),
        habits=("question the dataset first", "separate training from testing", "explain the model in plain language"),
        project="Create a small prediction experiment with a simple dataset and document what the model gets wrong.",
        reflection=("What pattern is the model actually learning?", "How can bias enter the pipeline?", "What metric matches the real objective?"),
    ),
    TopicProfile(
        name="cloud",
        keywords=("cloud", "distributed", "microservice", "container", "devops"),
        focus="building systems that stay reliable across machines, failures, and traffic changes",
        concepts=("scalability", "deployment", "service boundaries", "observability", "cost awareness"),
        habits=("separate compute from storage", "design for failure", "monitor before optimizing"),
        project="Sketch a campus service that can scale from ten users to ten thousand users without changing the product idea.",
        reflection=("Where is the single point of failure?", "What should be logged?", "What cost grows with usage?"),
    ),
    TopicProfile(
        name="security",
        keywords=("security", "cyber", "crypt", "privacy", "forensic", "secure"),
        focus="protecting systems, people, and data through layered thinking",
        concepts=("threat model", "least privilege", "authentication", "integrity", "incident response"),
        habits=("assume misuse is possible", "reduce unnecessary exposure", "log security-relevant events"),
        project="Review one student-facing service and write a short threat model with its biggest risks and mitigations.",
        reflection=("Who can misuse the system?", "What is the cost of failure?", "Which defenses add the most value first?"),
    ),
    TopicProfile(
        name="systems",
        keywords=("operating", "system", "os", "compiler", "network", "database", "architecture"),
        focus="understanding how software layers cooperate under real-world constraints",
        concepts=("resource management", "interfaces", "state transitions", "latency", "coordination"),
        habits=("follow data flow across layers", "treat concurrency carefully", "look for bottlenecks before blaming code"),
        project="Map how one request travels from user input to storage and back, including where time and memory are spent.",
        reflection=("Which layer owns this problem?", "Where is state stored?", "What happens under load?"),
    ),
    TopicProfile(
        name="web",
        keywords=("web", "frontend", "backend", "javascript", "html", "css", "react"),
        focus="creating clear, responsive user experiences backed by dependable services",
        concepts=("information hierarchy", "state flow", "accessibility", "API contracts", "feedback loops"),
        habits=("design for slow networks", "make actions obvious", "keep interfaces explainable"),
        project="Build a focused page for one library workflow and test whether a new user can finish it without guidance.",
        reflection=("What does the user need next?", "Which state is temporary or persistent?", "Where does confusion appear first?"),
    ),
    TopicProfile(
        name="programming",
        keywords=("programming", "code", "c ", "c++", "java", "python", "object-oriented", "oop", "software"),
        focus="turning ideas into working software with readable logic and disciplined structure",
        concepts=("abstraction", "decomposition", "testing", "debugging", "readability"),
        habits=("name things clearly", "build in small increments", "debug with evidence instead of guesswork"),
        project="Take one messy console workflow and refactor it into smaller reusable modules with explicit responsibilities.",
        reflection=("What belongs in one function?", "How do you prove behavior after refactoring?", "What would a teammate struggle to read?"),
    ),
    TopicProfile(
        name="math",
        keywords=("math", "algebra", "calculus", "probability", "statistics", "geometry"),
        focus="using formal reasoning to describe patterns, quantities, and change",
        concepts=("definitions", "relationships", "assumptions", "proof", "interpretation"),
        habits=("translate symbols into meaning", "check boundary cases", "connect formulas to examples"),
        project="Take one formula-driven topic and explain it from intuition to worked example to practical use.",
        reflection=("What does each symbol represent?", "Where does the rule come from?", "How would you explain it without notation first?"),
    ),
    TopicProfile(
        name="science",
        keywords=("physics", "chemistry", "biology", "science", "environment", "ecology"),
        focus="observing the world carefully and building explanations that survive testing",
        concepts=("model", "evidence", "measurement", "cause and effect", "revision"),
        habits=("separate observation from inference", "track assumptions", "connect theory to experiment"),
        project="Document a simple experiment, what you expected, what happened, and how the result changes your explanation.",
        reflection=("What did you actually observe?", "Which variable mattered most?", "How would you test the claim again?"),
    ),
    TopicProfile(
        name="humanities",
        keywords=("history", "society", "ethic", "philosophy", "literature", "psychology", "economics", "management"),
        focus="reading ideas in context and explaining how they shape real decisions and institutions",
        concepts=("context", "argument", "interpretation", "evidence", "human behavior"),
        habits=("ask who benefits", "compare multiple viewpoints", "link theory to lived reality"),
        project="Choose one idea from the topic and trace how it changes choices in a campus, family, or workplace setting.",
        reflection=("What assumptions drive this argument?", "What context is missing?", "How does this idea affect action?"),
    ),
)

DEFAULT_PROFILE = TopicProfile(
    name="general",
    keywords=(),
    focus="structured learning from first principles, examples, and reflection",
    concepts=("foundations", "patterns", "examples", "practice", "revision"),
    habits=("start simple", "connect concepts together", "review what changed in your understanding"),
    project="Build a short study resource that takes a beginner from zero context to confident first practice.",
    reflection=("What is the simplest useful explanation?", "Which example unlocks the topic?", "What should a learner do next?"),
)


def choose(options: tuple[str, ...], seed: int) -> str:
    return options[seed % len(options)]


def infer_profile(title: str) -> TopicProfile:
    lowered = f" {title.lower()} "
    for profile in TOPIC_PROFILES:
        if any(keyword in lowered for keyword in profile.keywords):
            return profile
    return DEFAULT_PROFILE


def escape(value: Any) -> str:
    return html.escape(str(value or ""))


def render_css() -> str:
    return """\
:root {
  color-scheme: light;
  --bg: #f3efe5;
  --paper: #fffdf8;
  --ink: #1f2937;
  --muted: #6b7280;
  --accent: #8a5a2b;
  --accent-soft: #eadac6;
  --line: #e6dccd;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  background:
    radial-gradient(circle at top, rgba(138, 90, 43, 0.10), transparent 32%),
    linear-gradient(180deg, #f7f1e8 0%, var(--bg) 100%);
  color: var(--ink);
}

.page {
  max-width: 920px;
  margin: 0 auto;
  padding: 40px 20px 72px;
}

.hero,
.card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: 0 18px 48px rgba(65, 41, 18, 0.08);
}

.hero {
  padding: 28px;
  margin-bottom: 20px;
}

.eyebrow {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font: 600 0.82rem/1.2 system-ui, sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

h1, h2, h3 {
  color: #1f1b16;
  line-height: 1.2;
}

h1 {
  margin: 14px 0 8px;
  font-size: clamp(2rem, 5vw, 3.4rem);
}

.subhead,
.meta,
.disclaimer,
li,
p {
  font-size: 1.02rem;
  line-height: 1.75;
}

.meta,
.disclaimer {
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 18px;
}

.card {
  padding: 22px;
}

ul {
  margin: 0;
  padding-left: 1.2rem;
}

a {
  color: var(--accent);
}

.footer-nav {
  margin-top: 28px;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.footer-link {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid var(--line);
  text-decoration: none;
  font: 600 0.94rem/1.2 system-ui, sans-serif;
}

.index-search {
  width: 100%;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--line);
  font: inherit;
  margin: 16px 0 24px;
}

.book-list {
  display: grid;
  gap: 14px;
}

.book-link {
  display: block;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--paper);
  text-decoration: none;
  color: inherit;
}

.book-link strong {
  display: block;
  font-size: 1.08rem;
  margin-bottom: 4px;
}

@media (max-width: 720px) {
  .page {
    padding: 24px 14px 48px;
  }

  .hero,
  .card {
    border-radius: 18px;
    padding: 18px;
  }
}
"""


def render_book_html(book: dict[str, Any]) -> str:
    title = str(book["title"]).strip() or f"Book {book['book_id']}"
    author = str(book.get("author") or "").strip() or "Unknown author"
    library_name = str(book.get("library_name") or "").strip() or "Smart Library"
    profile = infer_profile(title)
    seed = int(book["book_id"])

    opening_variants = (
        "This locally written edition turns a catalog entry into a guided learning experience built from first principles.",
        "This original text uses the topic label from your catalog as a starting point and then teaches the subject in fresh language.",
        "This Smart Library edition was written for access and clarity, with original explanations, practice ideas, and reflective prompts.",
    )
    bridge_variants = (
        "Instead of recreating a publisher's pages, it offers a clean route into the core ideas that a curious learner can study today.",
        "The goal is not imitation but accessibility: explain the field clearly, build confidence, and give the reader a practical next step.",
        "The result is a new educational resource that respects copyright while still widening access to learning.",
    )
    foundation_variants = (
        "A strong learner begins by naming the moving parts before trying to optimize them.",
        "Most confusion disappears when the subject is reduced to its smallest reliable model.",
        "Progress starts when concepts are connected to situations a reader can picture and test.",
    )
    practice_variants = (
        "Practice should move from observation to imitation to variation to confident independent use.",
        "The best exercises start small, create feedback quickly, and force the learner to explain each choice.",
        "Fluency grows when examples are reconstructed from memory rather than reread passively.",
    )
    closing_variants = (
        "A useful book leaves the reader with a method, not just a memory.",
        "The strongest ending to a study session is a clear idea of what to practice next.",
        "Real understanding shows up when the learner can teach the concept in plain language.",
    )

    concepts_html = "".join(f"<li>{escape(item.title())}</li>" for item in profile.concepts)
    habits_html = "".join(f"<li>{escape(item.capitalize())}</li>" for item in profile.habits)
    reflection_html = "".join(f"<li>{escape(item)}</li>" for item in profile.reflection)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(title)} | Smart Library Original</title>
  <link rel="stylesheet" href="/original_books/original-books.css">
</head>
<body>
  <main class="page">
    <section class="hero">
      <span class="eyebrow">Smart Library Original Edition</span>
      <h1>{escape(title)}</h1>
      <p class="subhead">Written locally by Smart Library as an original educational text for accessible learning.</p>
      <p class="meta">Catalog reference: Book ID {escape(book["book_id"])} • {escape(author)} • {escape(library_name)}</p>
      <p class="disclaimer">This page is original content generated from catalog metadata. It does not reproduce or transcribe any third-party book.</p>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Why This Edition Exists</h2>
        <p>{escape(choose(opening_variants, seed))} {escape(choose(bridge_variants, seed + 1))}</p>
        <p>The topic focus here is <strong>{escape(profile.focus)}</strong>. That means the reader should leave with a mental model, a study routine, and a way to apply the idea outside the page.</p>
      </article>
      <article class="card">
        <h2>Core Concepts</h2>
        <p>{escape(choose(foundation_variants, seed + 2))} For this title, the most helpful anchors are:</p>
        <ul>{concepts_html}</ul>
      </article>
    </section>

    <section class="card">
      <h2>Chapter 1: Foundations</h2>
      <p>{escape(title)} can be approached as a conversation between theory and action. A beginner needs definitions that are small enough to hold in mind, examples concrete enough to inspect, and questions honest enough to expose gaps. That is why this edition starts by slowing the subject down. Rather than assuming background knowledge, it asks what the learner can observe directly, what must be inferred, and what remains uncertain.</p>
      <p>In practical study, foundations matter because they control everything that comes later. When definitions are fuzzy, advanced material becomes memorized rather than understood. When the basics are stable, however, the learner can compare techniques, critique results, and transfer insight between problems. That is the real purpose of an introductory chapter: not to impress, but to stabilize the reader.</p>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Chapter 2: How To Think About The Topic</h2>
        <p>The central habit for this field is to move repeatedly between a simplified model and a real situation. In the simplified model, the rules are clear. In the real situation, the rules collide with time limits, messy inputs, human mistakes, and incomplete information. Learning happens when the reader notices what survives that transition and what must be adapted.</p>
        <p>For a student, this means every study session should include at least three moves: define the idea, test the idea, and explain the idea. Definition builds precision. Testing reveals behavior. Explanation reveals whether the understanding is portable or only copied. In that sense, reading is only half the work; reconstruction is the other half.</p>
      </article>
      <article class="card">
        <h2>Learning Habits</h2>
        <p>{escape(choose(practice_variants, seed + 3))}</p>
        <ul>{habits_html}</ul>
      </article>
    </section>

    <section class="card">
      <h2>Chapter 3: Practice Studio</h2>
      <p>A learner using this edition should create a small notebook or digital log with four repeating prompts: What is the goal? What are the moving parts? What would success look like? What failed when I tried it? These questions force the topic out of abstraction and into a form that can be revised. They also prevent the common trap of equating recognition with mastery.</p>
      <p>The best first project for this title is simple: {escape(profile.project)} The important thing is not the scale of the result, but the discipline of reflection around it. A compact, finished exercise teaches more than a broad idea left permanently half-built.</p>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Common Mistakes</h2>
        <p>Many learners struggle because they jump to tools before they understand the structure of the problem. Others read examples without changing them, which creates familiarity but not control. A third mistake is studying only when the path is clear; in reality, confusion is part of the method, and the skill is learning how to reduce it step by step.</p>
        <p>To avoid these traps, work slowly enough to inspect decisions, but actively enough to leave traces of your reasoning. Notes, sketches, rewritten examples, and short self-explanations all matter because they make thinking visible.</p>
      </article>
      <article class="card">
        <h2>Reflection Prompts</h2>
        <ul>{reflection_html}</ul>
      </article>
    </section>

    <section class="card">
      <h2>Closing Notes</h2>
      <p>{escape(choose(closing_variants, seed + 4))} That is the spirit of this Smart Library original: give the reader a starting point, a path through the topic, and enough confidence to continue independently.</p>
      <p>If you want to deepen this subject, repeat the cycle: read a concept, rebuild it in your own words, test it with one real example, and then write down what changed in your understanding. Over time, those small loops become expertise.</p>
    </section>

    <nav class="footer-nav">
      <a class="footer-link" href="/original_books/index.html">Browse All Local Originals</a>
      <a class="footer-link" href="/">Back To Smart Library</a>
    </nav>
  </main>
</body>
</html>
"""


def render_index_html(books: list[dict[str, Any]]) -> str:
    items = []
    for book in books:
        title = str(book["title"]).strip() or f"Book {book['book_id']}"
        author = str(book.get("author") or "").strip() or "Unknown author"
        library_name = str(book.get("library_name") or "").strip() or "Smart Library"
        items.append(
            f'<a class="book-link" data-title="{escape(title.lower())}" data-author="{escape(author.lower())}" data-library="{escape(library_name.lower())}" href="/original_books/book-{book["book_id"]}.html">'
            f"<strong>{escape(title)}</strong>"
            f"<span>Book ID {escape(book['book_id'])} • {escape(author)} • {escape(library_name)}</span>"
            f"</a>"
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Smart Library Originals</title>
  <link rel="stylesheet" href="/original_books/original-books.css">
</head>
<body>
  <main class="page">
    <section class="hero">
      <span class="eyebrow">Local Reading Shelf</span>
      <h1>Smart Library Originals</h1>
      <p class="subhead">Fresh locally stored educational editions written for access. These pages are original Smart Library content, not copied publisher text.</p>
      <p class="meta">{len(books)} locally stored reading pages generated from your current catalog.</p>
      <input id="indexSearch" class="index-search" type="search" placeholder="Search by title, author, or library">
    </section>
    <section id="bookList" class="book-list">
      {''.join(items)}
    </section>
    <nav class="footer-nav">
      <a class="footer-link" href="/">Back To Smart Library</a>
    </nav>
  </main>
  <script>
    const searchInput = document.getElementById('indexSearch');
    const links = Array.from(document.querySelectorAll('#bookList .book-link'));
    searchInput.addEventListener('input', () => {{
      const query = String(searchInput.value || '').trim().toLowerCase();
      links.forEach(link => {{
        const haystack = [link.dataset.title, link.dataset.author, link.dataset.library].join(' ');
        link.style.display = !query || haystack.includes(query) ? '' : 'none';
      }});
    }});
  </script>
</body>
</html>
"""


def get_connection() -> psycopg.Connection[Any]:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured.")
    return psycopg.connect(database_url, row_factory=dict_row)


def fetch_books(conn: psycopg.Connection[Any]) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
            b.book_id,
            b.title,
            b.author,
            b.read_online_url,
            l.name AS library_name
        FROM books b
        JOIN libraries l ON l.library_id = b.library_id
        ORDER BY b.book_id ASC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def write_original_books(books: list[dict[str, Any]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CSS_PATH.write_text(render_css(), encoding="utf-8")
    INDEX_PATH.write_text(render_index_html(books), encoding="utf-8")

    for book in books:
        html_path = OUTPUT_DIR / f"book-{book['book_id']}.html"
        html_path.write_text(render_book_html(book), encoding="utf-8")


def update_book_urls(
    conn: psycopg.Connection[Any],
    books: list[dict[str, Any]],
    overwrite_existing: bool,
) -> int:
    updated = 0
    for book in books:
        current_url = str(book.get("read_online_url") or "").strip()
        if current_url and not overwrite_existing and not current_url.startswith("/original_books/"):
            continue
        target_url = f"/original_books/book-{book['book_id']}.html"
        conn.execute(
            "UPDATE books SET read_online_url = %s WHERE book_id = %s",
            (target_url, book["book_id"]),
        )
        updated += 1
    return updated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate local Smart Library original editions.")
    parser.add_argument(
        "--overwrite-existing",
        action="store_true",
        help="Replace existing non-empty read_online_url values with local original file paths.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_local_env_file()

    with get_connection() as conn:
        books = fetch_books(conn)
        write_original_books(books)
        updated_count = update_book_urls(conn, books, overwrite_existing=args.overwrite_existing)
        conn.commit()

    print(f"Generated {len(books)} local original book pages in {OUTPUT_DIR}.")
    print(f"Updated {updated_count} book read_online_url values.")
    print(f"Index page: /original_books/index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
