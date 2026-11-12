/* ================================================================
 * Website photos and posters  (add-on, Nov 2026)
 *
 * Lets an admin add, change and remove the photos and posters that rotate on
 * the public site (stlukekofc.org). Pictures are saved as files in a Drive
 * folder; the list (caption, type, dates, order) lives on the "Website Photos"
 * tab of the ANNOUNCEMENTS workbook, so the public site reads it the same way
 * it reads announcements. No member data is involved.
 *
 * Privacy: the Drive folder itself stays private. Only a picture marked
 * "Public Site? = Yes" is shared (view only, by link). Hiding or deleting a
 * picture turns its sharing off.
 *
 * Who may use it: the Data Administrator(s), plus anyone whose email is listed
 * on the Assumptions tab in a row labelled "Website photo editor email"
 * (several addresses may be separated by commas).
 *
 * Setup (once): see testSitePhotos() at the bottom.
 * ================================================================ */

const SITE_PHOTOS_SHEET_ID = '1TPuMPjpACtOOeW2uJd8t2ZN3AkMVoKPnKV8gEOKLjLQ';  // the Announcements workbook
const SITE_PHOTOS_TAB = 'Website Photos';
const SITE_PHOTO_FOLDER_ID = '1QtSfC2gGVy5_SwELgAzYntVyqDqzCEmI';   // the "Council Website" folder in the Shared Drive. Blank = create "St Luke Website Photos" in the deploying account's My Drive.
const SITE_PHOTO_FOLDER_NAME = 'St Luke Website Photos';
const SITE_PHOTO_MAX_CHARS = 3000000;   // about 2.2 MB of picture after the page has shrunk it
const SITE_PHOTO_HEADERS = ['Photo ID', 'Caption', 'Type', 'Link', 'Public Site?', 'Show From', 'Show Through', 'Order', 'Added', 'Added By'];

function sitePhotoEditors_() {
  return readAssumption(['website photo editor email']).toLowerCase().split(/[,;\s]+/).filter(Boolean);
}

/** All email addresses on file for a member (a member row may list several). */
function memberEmails_(memberNumber) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('St Luke KOC Membership DB');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const cNum = headers.indexOf('Member Number'), cMail = headers.indexOf('email');
  if (cNum === -1 || cMail === -1) return [];
  for (let i = 1; i < data.length; i++) {
    if (stripZeros(data[i][cNum]) === stripZeros(memberNumber)) {
      return String(data[i][cMail] || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
    }
  }
  return [];
}

function canManageSitePhotos_(auth) {
  if (auth && auth.admin) return true;
  const editors = sitePhotoEditors_();
  if (!editors.length) return false;
  return memberEmails_(auth.memberNumber).some(e => editors.indexOf(e) !== -1);
}

function sitePhotosSheet_() {
  const ss = SpreadsheetApp.openById(SITE_PHOTOS_SHEET_ID);
  let sh = ss.getSheetByName(SITE_PHOTOS_TAB);
  if (!sh) {
    sh = ss.insertSheet(SITE_PHOTOS_TAB);
    sh.getRange(1, 1, 1, SITE_PHOTO_HEADERS.length).setValues([SITE_PHOTO_HEADERS]);
    sh.getRange('A:A').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

function sitePhotoFolder_() {
  if (SITE_PHOTO_FOLDER_ID) return DriveApp.getFolderById(SITE_PHOTO_FOLDER_ID);   // throws if this account cannot open it
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SITE_PHOTO_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* fall through and make a new one */ } }
  const folder = DriveApp.createFolder(SITE_PHOTO_FOLDER_NAME);
  props.setProperty('SITE_PHOTO_FOLDER', folder.getId());
  return folder;
}

function sitePhotoRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) return i + 2;
  return -1;
}

function truthyParam_(v) { return v === true || /^(y|yes|true|1)$/i.test(String(v == null ? '' : v).trim()); }

/** '' or yyyy-mm-dd -> a Date (or '' for blank); null if it is not a valid date. */
function siteDate_(s) {
  s = String(s || '').trim();
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d;
}

/** Turns public (link, view-only) sharing on or off for one picture. Returns '' or an error message. */
function setSitePhotoPublic_(file, makePublic) {
  try {
    if (makePublic) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    else file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    return '';
  } catch (err) {
    return makePublic
      ? 'This Drive account does not allow public sharing, so the picture could not be shown on the website. Ask the Workspace admin to allow link sharing for this folder.'
      : 'Could not turn sharing off: ' + err.message;
  }
}

/** Checks the page's fields; returns { error } or { fields }. */
function siteFields_(params) {
  const caption = String(params.caption || '').trim().slice(0, 140);
  if (!caption) return { error: 'Please give the picture a short caption. It is also read aloud for people who cannot see the picture.' };
  const type = /^poster$/i.test(String(params.type || '')) ? 'Poster' : 'Photo';
  const link = String(params.link || '').trim();
  if (link && !/^(https:\/\/|[a-z0-9\-]+\.html$)/i.test(link)) return { error: 'The link must start with https:// (or be a page such as events.html).' };
  const from = siteDate_(params.showFrom), through = siteDate_(params.showThrough);
  if (from === null || through === null) return { error: 'A date was not understood. Use the date picker.' };
  if (from && through && through < from) return { error: 'Show Through must not be before Show From.' };
  const orderRaw = String(params.order == null ? '' : params.order).trim();
  const order = orderRaw === '' ? '' : Number(orderRaw);
  if (order !== '' && isNaN(order)) return { error: 'Order must be a number.' };
  return { fields: { caption: caption, type: type, link: link, show: truthyParam_(params.show), from: from, through: through, order: order } };
}

function logSiteChange_(params, what, note) {
  try {
    logSheet().appendRow([new Date(), stripZeros(params.actor), String(params.memberName || '').trim(), 'Admin edit', 'Website', what, '', note, '', '']);
  } catch (err) { /* a log problem must not undo the change */ }
}

function handleSaveSitePhoto(params, auth) {
  if (!canManageSitePhotos_(auth)) return { success: false, error: 'not_allowed' };
  if (!truthyParam_(params.consent)) return { success: false, error: 'Please confirm that the people pictured have agreed (and that a parent or guardian agreed for any child).' };
  const photo = String(params.photo || '');
  if (photo.length < 100 || photo.indexOf('/9j/') !== 0 || !/^[A-Za-z0-9+\/]+={0,2}$/.test(photo)) return { success: false, error: 'That file is not a JPEG picture. Please try a different one.' };
  if (photo.length > SITE_PHOTO_MAX_CHARS) return { success: false, error: 'That picture is too large. Please try a smaller one.' };
  const v = siteFields_(params);
  if (v.error) return { success: false, error: v.error };
  const f = v.fields;

  const lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) { return { success: false, error: 'Could not save right now. Please try again.' }; }
  try {
    let folder;
    try { folder = sitePhotoFolder_(); }
    catch (err) { return { success: false, error: 'The photo folder could not be opened by the account that runs this script. Add that account to the Shared Drive as a Content manager, then try again.' }; }
    const blob = Utilities.newBlob(Utilities.base64Decode(photo), 'image/jpeg', 'site-' + Date.now() + '.jpg');
    const file = folder.createFile(blob);
    file.setName(f.caption.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) + ' ' + Date.now() + '.jpg');
    if (f.show) {
      const err = setSitePhotoPublic_(file, true);
      if (err) { file.setTrashed(true); return { success: false, error: err }; }
    }
    const by = (String(params.memberName || '').trim()) || ('#' + stripZeros(params.actor));
    sitePhotosSheet_().appendRow([file.getId(), f.caption, f.type, f.link, f.show ? 'Yes' : 'No', f.from, f.through, f.order, new Date(), by]);
    logSiteChange_(params, 'Photo', 'Added: ' + f.caption + (f.show ? ' (public)' : ' (hidden)'));
    return { success: true, id: file.getId() };
  } finally {
    lock.releaseLock();
  }
}

function handleUpdateSitePhoto(params, auth) {
  if (!canManageSitePhotos_(auth)) return { success: false, error: 'not_allowed' };
  const id = String(params.id || '').trim();
  if (!id) return { success: false, error: 'Missing id' };
  const v = siteFields_(params);
  if (v.error) return { success: false, error: v.error };
  const f = v.fields;

  const lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) { return { success: false, error: 'Could not save right now. Please try again.' }; }
  try {
    const sh = sitePhotosSheet_();
    const row = sitePhotoRow_(sh, id);
    if (row === -1) return { success: false, error: 'That picture was not found. It may have been deleted.' };
    let file = null;
    try { file = DriveApp.getFileById(id); } catch (err) { file = null; }
    if (file) {
      const err = setSitePhotoPublic_(file, f.show);
      if (err && f.show) return { success: false, error: err };
    } else if (f.show) {
      return { success: false, error: 'The picture file is missing from Drive, so it cannot be shown. Delete this entry and add the picture again.' };
    }
    sh.getRange(row, 2, 1, 7).setValues([[f.caption, f.type, f.link, f.show ? 'Yes' : 'No', f.from, f.through, f.order]]);
    logSiteChange_(params, 'Photo', 'Changed: ' + f.caption + (f.show ? ' (public)' : ' (hidden)'));
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function handleDeleteSitePhoto(params, auth) {
  if (!canManageSitePhotos_(auth)) return { success: false, error: 'not_allowed' };
  const id = String(params.id || '').trim();
  if (!id) return { success: false, error: 'Missing id' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) { return { success: false, error: 'Could not delete right now. Please try again.' }; }
  try {
    const sh = sitePhotosSheet_();
    const row = sitePhotoRow_(sh, id);
    if (row === -1) return { success: true, removed: false };
    const caption = String(sh.getRange(row, 2).getValue() || '');
    try { DriveApp.getFileById(id).setTrashed(true); } catch (err) { /* already gone is fine */ }
    sh.deleteRow(row);
    logSiteChange_(params, 'Photo', 'Deleted: ' + caption);
    return { success: true, removed: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Run this ONCE from the Apps Script editor (pick it in the function menu, click Run).
 * Google will ask you to approve Drive access. It then creates the Website Photos tab and
 * the Drive folder, and checks that this account can share a picture by link.
 */
function testSitePhotos() {
  const sh = sitePhotosSheet_();
  const folder = sitePhotoFolder_();
  const blob = Utilities.newBlob('test', 'text/plain', 'sharing-test.txt');
  const f = folder.createFile(blob);
  const err = setSitePhotoPublic_(f, true);
  f.setTrashed(true);
  Logger.log('Tab "' + sh.getName() + '" is ready.\nDrive folder: ' + folder.getName() + ' (' + folder.getUrl() + ')\n' +
    (err ? 'SHARING PROBLEM: ' + err : 'Link sharing works. You are set.'));
}
