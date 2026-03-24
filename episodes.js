/**
 * episodes.js — Fetches episode data from the published Google Sheet
 * and provides parsed episode objects for both index.html and ratings.html.
 */

const SHEET_ID = '1EGTGaIJuaQmPXr9N_NAaZhvoHjndKi8yb4K_-e8xpOM';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

/**
 * Parse a CSV string into an array of row arrays.
 * Handles quoted fields with commas and newlines.
 */
function parseCSV(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    let row = [];

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                current += '"';
                i++; // skip escaped quote
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(current.trim());
                current = '';
            } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
                row.push(current.trim());
                current = '';
                if (row.length > 1 || row[0] !== '') rows.push(row);
                row = [];
                if (ch === '\r') i++; // skip \n in \r\n
            } else {
                current += ch;
            }
        }
    }
    // Last field/row
    row.push(current.trim());
    if (row.length > 1 || row[0] !== '') rows.push(row);

    return rows;
}

/**
 * Convert a letter grade to a numeric value for sorting/averaging.
 * Uses an evenly-spaced 0-12 scale where each grade step = 1 point.
 */
function gradeToNumber(grade) {
    if (!grade) return null;
    const map = {
        'A+': 12, 'A': 11, 'A-': 10,
        'B+': 9,  'B': 8,  'B-': 7,
        'C+': 6,  'C': 5,  'C-': 4,
        'D+': 3,  'D': 2,  'D-': 1,
        'F': 0
    };
    return map[grade.trim()] ?? null;
}

/**
 * Convert a numeric value back to a letter grade.
 * Rounds to nearest grade on the 0-12 scale.
 */
function numberToGrade(num) {
    if (num === null || num === undefined) return null;
    const grades = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
    const idx = Math.round(Math.max(0, Math.min(12, num)));
    return grades[idx];
}

/**
 * Determine the CSS class suffix for a grade letter (a, b, c, d).
 */
function gradeClass(grade) {
    if (!grade) return '';
    const letter = grade.charAt(0).toUpperCase();
    if (letter === 'A') return 'a';
    if (letter === 'B') return 'b';
    if (letter === 'C') return 'c';
    if (letter === 'D' || letter === 'F') return 'd';
    return '';
}

/**
 * Format a date string (YYYY-MM-DD) into a readable format.
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Fetch and parse episodes from the Google Sheet.
 * Returns an array of episode objects sorted by episode number descending.
 */
async function fetchEpisodes() {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error(`Failed to fetch sheet: ${response.status}`);
    const text = await response.text();
    const rows = parseCSV(text);

    if (rows.length < 2) return [];

    // Header row — find column indices
    const headers = rows[0].map(h => h.toLowerCase().replace(/['"]/g, ''));
    const col = (name) => headers.indexOf(name);

    const episodeIdx = col('episode');
    const titleIdx = col('title');
    const subtitleIdx = col('subtitle');
    const dateIdx = col('release date');
    const typeIdx = col('type');
    const genreIdx = col('genre');
    const gregGradeIdx = col('greg grade');
    const brianGradeIdx = col('brian grade');
    let jrGradeIdx = col('jr grade');
    if (jrGradeIdx < 0) jrGradeIdx = col('joshua grade');
    const guestNameIdx = col('guest name');
    const guestGradeIdx = col('guest grade');
    const overallGradeIdx = col('overall grade');
    const spotifyUrlIdx = col('spotify url');
    const thumbnailUrlIdx = col('thumbnail url');

    const episodes = [];

    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const epNum = r[episodeIdx]?.replace(/['"]/g, '');
        const title = r[titleIdx]?.replace(/['"]/g, '');

        if (!epNum || !title) continue;

        const gregGrade = r[gregGradeIdx]?.replace(/['"]/g, '') || '';
        const brianGrade = r[brianGradeIdx]?.replace(/['"]/g, '') || '';
        const jrGrade = r[jrGradeIdx]?.replace(/['"]/g, '') || '';
        const guestGrade = r[guestGradeIdx]?.replace(/['"]/g, '') || '';
        const guestName = r[guestNameIdx]?.replace(/['"]/g, '') || '';

        // Calculate overall grade from host grades
        const hostGrades = [gregGrade, brianGrade, jrGrade].filter(g => g);
        let overallGrade = r[overallGradeIdx]?.replace(/['"]/g, '') || '';

        if (!overallGrade && hostGrades.length > 0) {
            const nums = hostGrades.map(gradeToNumber).filter(n => n !== null);
            if (nums.length > 0) {
                const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
                overallGrade = numberToGrade(avg);
            }
        }

        const type = r[typeIdx]?.replace(/['"]/g, '') || '';
        const isSpecial = type === 'Special';

        const spotifyUrl = (spotifyUrlIdx >= 0 ? r[spotifyUrlIdx]?.replace(/['"]/g, '') : '') || '';
        const thumbnailUrl = (thumbnailUrlIdx >= 0 ? r[thumbnailUrlIdx]?.replace(/['"]/g, '') : '') || '';

        episodes.push({
            number: epNum,
            numericNumber: parseFloat(epNum) || 0,
            title: title,
            subtitle: r[subtitleIdx]?.replace(/['"]/g, '') || '',
            date: r[dateIdx]?.replace(/['"]/g, '') || '',
            dateFormatted: formatDate(r[dateIdx]?.replace(/['"]/g, '') || ''),
            type: type,
            genre: r[genreIdx]?.replace(/['"]/g, '') || '',
            gregGrade,
            brianGrade,
            jrGrade, // Joshua
            guestName,
            guestGrade,
            overallGrade,
            overallGradeClass: gradeClass(overallGrade),
            hasGrades: hostGrades.length > 0,
            isSpecial,
            spotifyUrl,
            thumbnailUrl,
        });
    }

    // Sort by episode number descending (newest first)
    episodes.sort((a, b) => b.numericNumber - a.numericNumber);

    return episodes;
}

/**
 * TMDB poster fetching.
 * Uses the free TMDB API to search for movie/TV posters by title.
 * Falls back gracefully — no poster is fine, the grade badge shows instead.
 */
const TMDB_API_KEY = 'f960c517a08f82bdd10d4702e9a49bca';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w185';

/**
 * Search TMDB for a poster by title and type.
 * Returns a poster URL or empty string.
 */
async function fetchTMDBPoster(title, type) {
    if (!TMDB_API_KEY) return '';

    // Clean title: remove year in parens, remove subtitles after colon for better search
    const cleanTitle = title
        .replace(/\s*\(\d{4}\)\s*/g, '')
        .replace(/\s*[-–]\s*.*$/, '') // Remove subtitle after dash (e.g. "Steely Dan - Aja" → "Steely Dan")
        .trim();

    const mediaType = (type === 'TV Show') ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&page=1`;

    try {
        const res = await fetch(url);
        if (!res.ok) return '';
        const data = await res.json();
        const result = data.results?.[0];
        if (result?.poster_path) {
            return TMDB_IMG_BASE + result.poster_path;
        }
    } catch (e) {
        // Silently fail — no poster is fine
    }
    return '';
}

/**
 * Enrich episodes with TMDB posters for those missing thumbnails.
 * Only fetches for Movie/TV Show types (not Music Albums or Specials).
 * Runs in parallel batches to avoid hammering the API.
 */
async function enrichWithPosters(episodes) {
    if (!TMDB_API_KEY) return episodes;

    const needsPoster = episodes.filter(ep =>
        !ep.thumbnailUrl &&
        !ep.isSpecial &&
        (ep.type === 'Movie' || ep.type === 'TV Show' || ep.type === 'Documentary')
    );

    // Fetch in batches of 5
    for (let i = 0; i < needsPoster.length; i += 5) {
        const batch = needsPoster.slice(i, i + 5);
        const results = await Promise.all(
            batch.map(ep => fetchTMDBPoster(ep.title, ep.type))
        );
        results.forEach((url, idx) => {
            if (url) batch[idx].thumbnailUrl = url;
        });
    }

    return episodes;
}

// Export for use
window.RTS = { fetchEpisodes, enrichWithPosters, gradeClass, formatDate, gradeToNumber, numberToGrade };
