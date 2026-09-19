---
# Copy this file to newsletter/issues/YYYY-MM-DD.md (the date is the file name, so it is not listed here).
# Only these two keys are allowed. Anything else is an error shown on the page.
issue_number: 0
title: "Issue title"
---

<!--
  ISSUE STRUCTURE (comments like this one never appear on the page)

  1. Front matter (top of file): issue_number and title. The newsletter's own name,
     __dunder__ Review, is part of the page, so the title here is this issue's headline.

  2. Intro: ONE paragraph directly below the front matter, before the first "##".
     It shows under the issue title. Inline `code`, *emphasis* and
     [links](https://example.com) are fine. Delete it for no intro.

  3. Sections: every "##" heading starts a new section, in the order written.
     There is no "#" heading. A section is one of two kinds, chosen by what is
     under its heading:

     LINKS SECTION - the body is ONLY a bullet list, one link per bullet:
         - [Title](https://url): One-line summary, may use `code` and *emphasis*.
       Every bullet needs a title, an http(s) URL, a colon straight after the
       link, and a non-empty summary. A bad bullet shows an error naming its line.

     ARTICLE SECTION - anything else: paragraphs, "###" subheadings, lists,
       block quotes, and fenced code blocks. Put the language after the fence
       (```python) to get syntax highlighting.

     A section with a paragraph or heading next to its bullet list is an ARTICLE,
     so its bullets render as a plain list, not as link cards. To get link cards,
     keep the list alone in its own section.

  4. Comments: HTML comments like this one must start on their own line with a
     blank line around them. Other raw HTML is shown as visible text, not rendered.

  5. Name gotcha: Markdown renders __dunder__ as bold. Write the name as `__dunder__`
     (in backticks) anywhere it appears in prose.

  6. Publishing: add an entry for the issue to newsletter/issues.json (newest first
     or last, the page sorts by date). GitHub Pages can take about 10 minutes to
     show a new file to repeat visitors.

  Replace everything below with the real content. Delete sections you do not need.
-->

One paragraph that sets up the issue: what is in it and why it is worth a read.

## Deep Dive: Topic Title

Lead with the problem or the question. Prose, `inline code` and
[links](https://example.com) all work.

### A subheading

Show, then explain. Fenced code blocks are highlighted using the active theme's
syntax colors.

```python
import polars as pl

df = pl.DataFrame({"price": [10.0, 20.0]})
df.with_columns(pl.col("price").mul(1.2).alias("gross"))
```

- Plain bullets are fine inside an article.
- So are numbered lists and block quotes.

> A block quote for a takeaway or a pull quote.

## Package Reviews

- [package-name](https://example.com): What it is and why it is worth a look.
- [another-package](https://example.com): Keep it to a sentence or two.

## New Repos

- [owner/repo](https://github.com/owner/repo): Why this project deserves a star.

## Updates

- [CPython release notes](https://docs.python.org/3/whatsnew/): What landed in the language or stdlib.
