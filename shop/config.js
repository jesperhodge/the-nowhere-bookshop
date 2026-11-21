/* ============================================================
   The one config file for whichever shop this build is wearing.

   It's JS, not JSON, so it loads through the exact same static
   ES-module `import` path as everything else under src/js/ — no
   fetch, no build step, no server round-trip just to find out the
   shop's name.

   `main` always carries the Nowhere Bookshop's own identity —
   the fictional, demo shop this repo already is (see index.html:
   "a small shop that goes on forever", "Nothing here is on the
   shelf because it sold well."). That's deliberate: this branch
   is the regression baseline, so it must never ship a real
   business's name, address or phone number. A real shop's edit
   happens on an unpushed local branch instead — never on main.

   Every field here is read by src/js/shopconfig.js as untrusted
   input and validated before use; see that file for the rules.
   ============================================================ */

export default {
  id: 'nowhere',
  name: 'The Nowhere Bookshop',
  type: 'A small shop that goes on forever',
  tagline: 'Nothing here is on the shelf because it sold well.',
  logo: 'assets/placeholder-logo.svg',
  colours: { primary: '#1d1512', accent: '#c98a4b', neutral: '#f4efe6' },
  font: { display: 'Fraunces', body: 'Inter' },
  address: ['Est. nowhere in particular'],
  hours: [['Always', 'Open']],
  contact: { phone: '', email: '', url: '' },
  store: {
    label: 'Find at The Nowhere Bookshop',
    isbnSearch: 'https://example.com/search?q={isbn}',
    titleSearch: 'https://example.com/search?q={title}+{author}',
  },
  frontTable: {
    name: 'Fresh off the press',
    isbns: [],
  },
  categories: [
    { id: 'fiction', name: 'Fiction', line: '', prizes: ['booker', 'pulitzer-fiction', 'womens'] },
    { id: 'mystery', name: 'Mystery, Thriller & Suspense', line: '', prizes: ['gold-dagger', 'edgar-novel', 'anthony-novel'] },
    { id: 'sff', name: 'Science Fiction & Fantasy', line: '', prizes: ['hugo-novel', 'nebula-novel', 'wfa-novel'] },
    { id: 'graphic', name: 'Comics & Graphic Novels', line: '', prizes: ['eisner-newseries'] },
  ],
};
