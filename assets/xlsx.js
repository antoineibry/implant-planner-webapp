/* Minimal .xlsx reader.
   An .xlsx file is a ZIP archive of XML parts. This reads the ZIP central
   directory, inflates the parts it needs with the browser's built-in
   DecompressionStream, and pulls the cell values out of the first worksheet.
   No external library, so the app keeps working offline and from a plain folder. */
(function () {
  'use strict';

  var SIG_EOCD = 0x06054b50;
  var SIG_CENTRAL = 0x02014b50;

  function findEndOfCentralDirectory(view) {
    var min = Math.max(0, view.byteLength - 22 - 65535);
    for (var i = view.byteLength - 22; i >= min; i--) {
      if (view.getUint32(i, true) === SIG_EOCD) return i;
    }
    return -1;
  }

  function readCentralDirectory(buffer) {
    var view = new DataView(buffer);
    var eocd = findEndOfCentralDirectory(view);
    if (eocd < 0) throw new Error('That file is not a readable .xlsx workbook.');

    var count = view.getUint16(eocd + 10, true);
    var pointer = view.getUint32(eocd + 16, true);
    var decoder = new TextDecoder();
    var entries = {};

    for (var i = 0; i < count; i++) {
      if (view.getUint32(pointer, true) !== SIG_CENTRAL) {
        throw new Error('The .xlsx file appears to be damaged.');
      }
      var nameLength = view.getUint16(pointer + 28, true);
      var extraLength = view.getUint16(pointer + 30, true);
      var commentLength = view.getUint16(pointer + 32, true);
      var name = decoder.decode(new Uint8Array(buffer, pointer + 46, nameLength));
      entries[name] = {
        method: view.getUint16(pointer + 10, true),
        compressedSize: view.getUint32(pointer + 20, true),
        localOffset: view.getUint32(pointer + 42, true)
      };
      pointer += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error(
        'This browser cannot unpack .xlsx files. Please use an up-to-date Chrome, Edge, Firefox or Safari.'
      ));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buffer) {
      return new Uint8Array(buffer);
    });
  }

  function readEntry(buffer, entries, name) {
    var entry = entries[name];
    if (!entry) return Promise.resolve(null);

    var view = new DataView(buffer);
    var nameLength = view.getUint16(entry.localOffset + 26, true);
    var extraLength = view.getUint16(entry.localOffset + 28, true);
    var start = entry.localOffset + 30 + nameLength + extraLength;
    var raw = new Uint8Array(buffer, start, entry.compressedSize);

    var decoded = entry.method === 0 ? Promise.resolve(raw) : inflateRaw(raw);
    return decoded.then(function (bytes) {
      return new TextDecoder().decode(bytes);
    });
  }

  function parseXml(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('The .xlsx file contains unreadable content.');
    }
    return doc;
  }

  function textOf(node) {
    // Shared strings can be split across several <t> runs; join them in order.
    var parts = node.getElementsByTagName('t');
    var out = '';
    for (var i = 0; i < parts.length; i++) out += parts[i].textContent;
    return out;
  }

  function readSharedStrings(text) {
    if (!text) return [];
    var items = parseXml(text).getElementsByTagName('si');
    var strings = [];
    for (var i = 0; i < items.length; i++) strings.push(textOf(items[i]));
    return strings;
  }

  function columnIndex(reference) {
    var index = 0;
    for (var i = 0; i < reference.length; i++) {
      var code = reference.charCodeAt(i);
      if (code < 65 || code > 90) break;
      index = index * 26 + (code - 64);
    }
    return index - 1;
  }

  function firstWorksheetName(entries, workbookXml, relsXml) {
    if (workbookXml && relsXml) {
      var sheets = parseXml(workbookXml).getElementsByTagName('sheet');
      if (sheets.length) {
        var id = sheets[0].getAttribute('r:id') || sheets[0].getAttribute('id');
        var relationships = parseXml(relsXml).getElementsByTagName('Relationship');
        for (var i = 0; i < relationships.length; i++) {
          if (relationships[i].getAttribute('Id') === id) {
            var target = relationships[i].getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '');
            if (entries['xl/' + target]) return 'xl/' + target;
          }
        }
      }
    }
    var names = Object.keys(entries).filter(function (name) {
      return /^xl\/worksheets\/sheet\d*\.xml$/.test(name);
    }).sort();
    if (!names.length) throw new Error('The workbook has no worksheets.');
    return names[0];
  }

  function readSheet(text, strings) {
    var rowNodes = parseXml(text).getElementsByTagName('row');
    var rows = [];

    for (var r = 0; r < rowNodes.length; r++) {
      var rowNumber = parseInt(rowNodes[r].getAttribute('r'), 10) || rows.length + 1;
      var cells = rowNodes[r].getElementsByTagName('c');
      var values = [];

      for (var c = 0; c < cells.length; c++) {
        var cell = cells[c];
        var reference = cell.getAttribute('r');
        var index = reference ? columnIndex(reference) : c;
        var type = cell.getAttribute('t');
        var value = null;

        if (type === 's') {
          var v = cell.getElementsByTagName('v')[0];
          value = v ? strings[parseInt(v.textContent, 10)] : null;
        } else if (type === 'inlineStr') {
          value = textOf(cell);
        } else if (type === 'str') {
          var f = cell.getElementsByTagName('v')[0];
          value = f ? f.textContent : null;
        } else {
          var n = cell.getElementsByTagName('v')[0];
          if (n && n.textContent !== '') {
            var parsed = parseFloat(n.textContent);
            value = isNaN(parsed) ? n.textContent : parsed;
          }
        }
        values[index] = (typeof value === 'string' && value.trim() === '') ? null : value;
      }

      rows.push({ number: rowNumber, values: values });
    }
    return rows;
  }

  /* Returns [{ number: <spreadsheet row number>, values: [col A, col B, ...] }] */
  function readRows(buffer) {
    var entries;
    try {
      entries = readCentralDirectory(buffer);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.all([
      readEntry(buffer, entries, 'xl/sharedStrings.xml'),
      readEntry(buffer, entries, 'xl/workbook.xml'),
      readEntry(buffer, entries, 'xl/_rels/workbook.xml.rels')
    ]).then(function (parts) {
      var strings = readSharedStrings(parts[0]);
      var sheetName = firstWorksheetName(entries, parts[1], parts[2]);
      return readEntry(buffer, entries, sheetName).then(function (sheetXml) {
        if (!sheetXml) throw new Error('The first worksheet could not be read.');
        return readSheet(sheetXml, strings);
      });
    });
  }

  window.XlsxReader = { readRows: readRows };
})();
