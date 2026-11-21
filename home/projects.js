/* ============================================================
   The one data file behind the homepage.

   All three forms (Tractatus, Ethics, Dialogue) are generated from
   this. To add a project, add one object to PROJECTS — nothing else
   in home/ needs to change (index.html's <noscript> list is the only
   other place that names projects; keep it in step).

   Every string is plain text, except that *asterisks* make italics.
   Write each one so it reads well in all three forms:
     thesis   a full sentence, third person, starts with "It is…"
     method   a full sentence, third person, starts with "It is…"
     gloss    the marginal remark: the *why*, one or two sentences
     question what Socrates asks; must be answerable by the thesis
   ============================================================ */

export const PERSON = {
  name: 'Jesper Hodge',
  about: 'Studied philosophy. Does deep thinking and thoughtful tech. Builds things.',
  /* kind: 'shown' (the work itself) or 'said' (an account of the work);
     the forms use it for a joke about Tractatus 4.1212. Optional. */
  links: [
    { label: 'GitHub', href: 'https://github.com/jesperhodge', kind: 'shown' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/jesper-hodge', kind: 'said' },
  ],
};

export const PROJECTS = [
  {
    slug: 'bookshop',
    title: 'The Nowhere Bookshop',
    href: '/bookshop/',
    year: 2026,
    status: 'open', // 'open' | 'in progress' | 'archived'
    thesis:
      'It is a curated 3D bookshop: you wander the rooms, pull books off the shelf, and buy from an independent seller.',
    method:
      'It is written by hand in three.js, with no bundler and no build step; Express serves the one API route and nothing else.',
    tags: ['three.js', 'vanilla JS', 'Express', 'Vercel'],
    gloss:
      'Every shelf is hand-picked from prize lists and critics’ choices, never bestsellers by default. A bookshop is an argument about what is worth reading; this one makes the argument in rooms.',
    question: 'What is a bookshop, Jesper, if nothing in it is there because it sold well?',
  },
];
