/*
 * Why Dues quick-link toggle
 * --------------------------
 * Controlled by the "Include Why Dues quicklink" row on the Assumptions tab.
 * Value "Yes" shows the link; anything else (No, blank, or the sheet can't be
 * reached) keeps it hidden. Loaded in <head> so the link never flashes on screen
 * before being hidden.
 */
(function () {
    // Hide immediately, before the page draws
    var style = document.createElement('style');
    style.textContent =
        '.nav-whydues { display:none !important; }' +
        'html.show-whydues .nav-whydues { display:flex !important; }';
    document.head.appendChild(style);

    var SHEET_ID = KOC_CONFIG.assumptionsSheetId;
    var ASSUMPTIONS_GID = KOC_CONFIG.gids.assumptions;
    var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
              '/gviz/tq?tqx=out:json&gid=' + ASSUMPTIONS_GID;

    fetch(url)
        .then(function (res) { return res.text(); })
        .then(function (text) {
            var match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
            if (!match) return;
            var rows = JSON.parse(match[1]).table.rows;
            var row = rows.find(function (r) {
                var c = r.c[0];
                var label = c && (c.v || c.f);
                return label && String(label).trim().toLowerCase().indexOf('include why dues quicklink') === 0;
            });
            if (!row) return;
            var cell = row.c[1];
            var value = cell ? String(cell.v != null ? cell.v : (cell.f || '')).trim().toLowerCase() : '';
            if (value === 'yes' || value === 'y' || value === 'true') {
                document.documentElement.classList.add('show-whydues');
            }
        })
        .catch(function () { /* quiet fail — link stays hidden */ });
})();

/*
 * Website Photos quick-link
 * -------------------------
 * Adds a "Website Photos" tab to the top menu for the people who manage the public website's pictures:
 *  - a Data Administrator who has admin tools switched on (?admin=on), or
 *  - anyone for whom the Website Photos page has already worked once on this device
 *    (that page sets the "mcSitePhotos" flag), so listed photo editors who are not
 *    administrators can find it too. The Apps Script still decides who may actually save.
 */
(function () {
    function show() {
        try {
            if (typeof Session === 'undefined' || !Session.read()) return;
            var editor = Session.adminTools() || localStorage.getItem('mcSitePhotos') === 'on';
            if (!editor) return;
            var ul = document.querySelector('nav ul');
            if (!ul || ul.querySelector('a[href="website-photos.html"]')) return;
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.href = 'website-photos.html';
            a.className = 'navlink preserve-member';
            a.textContent = 'Website Photos';
            li.appendChild(a);
            ul.appendChild(li);
        } catch (e) { /* the menu simply stays as it is */ }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
})();
