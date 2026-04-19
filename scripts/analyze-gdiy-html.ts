/**
 * Analyse la structure HTML d'une page gdiy.fr/podcast/{slug}/ pour calibrer
 * les sélecteurs du scraper.
 */
import { load } from 'cheerio';
import fs from 'fs';

const html = fs.readFileSync('C:\\Users\\jerem\\AppData\\Local\\Temp\\gdiy-marwan.html', 'utf-8');
const $ = load(html);

console.log('=== Title h1 ===');
console.log('h1:', $('h1').first().text().trim().slice(0, 120));
console.log('\n=== single__content rich-text ===');
const mainSelectors = [
  '.single__content.rich-text',
  '.single__content',
  '.single-page .rich-text',
  'main .rich-text',
];
for (const sel of mainSelectors) {
  const len = $(sel).text().trim().length;
  if (len > 0) console.log(`  ${sel}: ${len} chars, ${$(sel).find('p').length} p, ${$(sel).find('ul li').length} li, ${$(sel).find('h2,h3').length} headings`);
}

console.log('\n=== Sections headings ===');
$('.single__content h2, .single__content h3').each((_, el) => {
  console.log('  H:', $(el).text().trim().slice(0, 80));
});

console.log('\n=== Paragraphes (5 first) ===');
$('.single__content p').slice(0, 5).each((_, el) => {
  console.log('  P:', $(el).text().trim().slice(0, 140));
});

console.log('\n=== Bullet list items (10 first) ===');
$('.single__content ul li').slice(0, 10).each((_, el) => {
  console.log('  •', $(el).text().trim().slice(0, 120));
});

console.log('\n=== Links (20 first) ===');
$('.single__content a[href]').slice(0, 20).each((_, el) => {
  const href = $(el).attr('href') ?? '';
  const text = $(el).text().trim();
  console.log(`  [${text.slice(0, 40)}] → ${href.slice(0, 80)}`);
});

console.log('\n=== Headings "anciens épisodes" / "Nous avons parlé" ===');
$('.single__content h2, .single__content h3').each((_, el) => {
  const t = $(el).text().trim();
  if (/ancien|mentionn|parl[ée]|ressource/i.test(t)) {
    console.log('  MATCH:', t);
    // list items after
    const items = $(el).nextUntil('h2,h3').find('a[href]');
    items.each((_, a) => console.log('    →', $(a).text().trim(), '=', $(a).attr('href')));
  }
});

console.log('\n=== Postid (for episode mapping) ===');
console.log('  data-postid:', $('.single__content').attr('data-postid'));

console.log('\n=== Rating ===');
console.log('  rating block:', $('.single-content__rating').html()?.trim().slice(0, 200));
