// A faster drop-in for csv-reader 1.0.0 on the csv-reader-speed-01 bounty: run(input) returns the same
// {columns, rows, errors} answer csv-reader 1.0.0 returns for {text, header}, by cutting whole fields out
// of the text with native substring search instead of building every field one character at a time.
//
// It keeps the reference's field -> record -> output method and only changes how the text is read: an
// unquoted field ends at the next comma or line break, a quoted field at its closing quote, and the field
// comes out as one slice. Where the next comma, line break and carriage return are is kept between fields
// (they only ever move forward, so each is searched for once per stretch of text), and the fast paths take
// only plain fields: a stray CR, a doubled quote or a quote that never closes falls back to a character
// scan that follows csv-reader 1.0.0 step by step.
//
// Pure: no clock, no randomness, nothing kept from one call to the next. The scratch variables below are
// only the scanners' way of handing a field, how it ended and the text position back to the record loop.

/** How a field ended: at a comma (the record goes on), at a line break or at the end of the text. */
const END_COMMA = 1;
const END_LINE = 2;
const END_TEXT = 3;

/** Scratch handed back from a scanner to the record loop. */
let _p = 0;
let _line = 1;
let _kind = END_TEXT;
let _added = 0;
let _errors = null;
let _recordLine = 1;
let _recordRow = null;
let _text = '';
let _len = 0;
// -2: not looked for yet, -1: none left in the text, else the first one at or after _p.
let _nextComma = -2;
let _nextLf = -2;
let _nextCr = -2;

const QUOTE = 34;
const COMMA = 44;
const CR = 13;
const LF = 10;
const BOM = 0xfeff;

/** The characters kept by an unquoted read of the text from _p, appended to `value`. */
function readUnquoted(value) {
  const text = _text;
  const n = _len;
  let p = _p;
  let line = _line;
  let added = 0;

  for (;;) {
    if (p >= n) {
      _p = p;
      _line = line;
      _kind = END_TEXT;
      _added += added;
      return value;
    }
    if (_nextComma !== -1 && _nextComma < p) _nextComma = text.indexOf(',', p);
    if (_nextLf !== -1 && _nextLf < p) _nextLf = text.indexOf('\n', p);
    if (_nextCr !== -1 && _nextCr < p) _nextCr = text.indexOf('\r', p);

    const iComma = _nextComma;
    const iLf = _nextLf;
    let end;
    let kind;
    if (iComma !== -1 && (iLf === -1 || iComma < iLf)) {
      end = iComma;
      kind = END_COMMA;
    } else if (iLf !== -1) {
      end = iLf;
      kind = END_LINE;
    } else {
      end = n;
      kind = END_TEXT;
    }
    // A CRLF ends the record at its CR; the CR is not part of the field.
    const crlf = kind === END_LINE && end > p && text.charCodeAt(end - 1) === CR;
    const stop = crlf ? end - 1 : end;
    const seg = text.slice(p, stop);
    if (_nextCr === -1 || _nextCr >= stop) {
      value = value.length === 0 ? seg : value + seg;
      added += seg.length;
      _p = kind === END_TEXT ? n : end + 1;
      _line = kind === END_LINE ? line + 1 : line;
      _kind = kind;
      _added += added;
      return value;
    }
    // A CR the reference drops (stray_cr) is in this field, so it is read character by character.
    for (let i = 0; i < stop - p; i++) {
      if (text.charCodeAt(p + i) === CR) {
        _errors.push({ code: 'stray_cr', line: _recordLine, row: _recordRow });
        continue;
      }
      value += seg[i];
      added += 1;
    }
    _p = kind === END_TEXT ? n : end + 1;
    _line = kind === END_LINE ? line + 1 : line;
    _kind = kind;
    _added += added;
    return value;
  }
}

/** The field of a record that opens with a quote at _p. */
function readQuoted() {
  const text = _text;
  const n = _len;
  const open = _p;
  const openLine = _line;
  let close = -1;
  let q = open + 1;
  for (;;) {
    const at = text.indexOf('"', q);
    if (at < 0) break;
    if (at + 1 < n && text.charCodeAt(at + 1) === QUOTE) {
      q = at + 2;
      continue;
    }
    close = at;
    break;
  }
  if (close < 0) {
    // The quote never closes: it is a literal character and the text after it is read as unquoted.
    _p = open + 1;
    _line = openLine;
    _nextComma = -2;
    _nextLf = -2;
    _errors.push({ code: 'unterminated_quote', line: _recordLine, row: _recordRow });
    return readUnquoted('"');
  }

  if (_nextCr !== -1 && _nextCr < open) _nextCr = text.indexOf('\r', open);
  const seg = text.slice(open + 1, close);
  let value;
  if (_nextCr === -1 || _nextCr >= close) {
    let nl = 0;
    let at = seg.indexOf('\n');
    while (at >= 0) {
      nl += 1;
      at = seg.indexOf('\n', at + 1);
    }
    _line = openLine + nl;
    value = seg.indexOf('""') < 0 ? seg : seg.split('""').join('"');
  } else {
    // A CR inside a quoted field is read as LF, and every CRLF and lone CR there is one line.
    let out = '';
    let line = openLine;
    let i = 0;
    const stop = close - open - 1;
    while (i < stop) {
      const code = seg.charCodeAt(i);
      if (code === CR) {
        out += '\n';
        line += 1;
        i += i + 1 < stop && seg.charCodeAt(i + 1) === LF ? 2 : 1;
        continue;
      }
      if (code === LF) {
        line += 1;
        out += '\n';
        i += 1;
        continue;
      }
      if (code === QUOTE) {
        // Every quote left in here was half of a doubled pair.
        out += '"';
        i += 2;
        continue;
      }
      out += seg[i];
      i += 1;
    }
    value = out;
    _line = line;
  }

  _p = close + 1;
  if (_p >= n) {
    _kind = END_TEXT;
    return value;
  }
  const code = text.charCodeAt(_p);
  if (code === COMMA) {
    _p += 1;
    _kind = END_COMMA;
    return value;
  }
  if (code === LF) {
    _p += 1;
    _line += 1;
    _kind = END_LINE;
    return value;
  }
  if (code === CR && _p + 1 < n && text.charCodeAt(_p + 1) === LF) {
    _p += 2;
    _line += 1;
    _kind = END_LINE;
    return value;
  }
  // What follows the closing quote is appended as it stands, up to the next comma or line break.
  _added = 0;
  _nextComma = -2;
  _nextLf = -2;
  const junk = readUnquoted(value);
  if (_added > 0) _errors.push({ code: 'quote_junk', line: _recordLine, row: _recordRow });
  return junk;
}

/** The reading of one CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  _text = text;
  _len = n;
  _errors = errors;
  _p = n !== 0 && text.charCodeAt(0) === BOM ? 1 : 0;
  _line = 1;
  _recordLine = 1;
  _recordRow = null;
  _nextComma = -2;
  _nextLf = -2;
  _nextCr = -2;

  let p = _p;
  let line = 1;

  while (p < n) {
    // A line left with no characters is no record.
    const first = text.charCodeAt(p);
    if (first === LF) {
      p += 1;
      line += 1;
      continue;
    }
    if (first === CR && p + 1 < n && text.charCodeAt(p + 1) === LF) {
      p += 2;
      line += 1;
      continue;
    }

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    _recordLine = recordLine;
    _recordRow = recordRow;

    const fields = [];
    let quotedStart = false;
    let ended = END_COMMA;
    let index = 0;
    while (ended === END_COMMA) {
      _p = p;
      _line = line;
      _added = 0;
      let value;
      if (text.charCodeAt(p) === QUOTE) {
        if (index === 0) quotedStart = true;
        value = readQuoted();
      } else {
        value = readUnquoted('');
      }
      fields.push(value);
      p = _p;
      line = _line;
      ended = _kind;
      index += 1;
    }

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quotedStart) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns === null ? [] : columns) : null, rows, errors };
}
