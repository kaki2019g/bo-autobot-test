const CONTACT_SPREADSHEET_ID = '1hhvEM7c2QVxjX7JiIQQI90vvc-bdY1_UOIaCcOo-B5Q';
const CONTACT_SHEET_NAME = 'inquiries';
const CONTACT_ADMIN_EMAIL = 'kaki2019g@gmail.com';
const PRODUCT_SHEET_NAME = 'products';
const CONTACT_REPLY_FROM_NAME = 'bo-autobot';
const CONTACT_REPLY_SUBJECT = '【受付完了】お問い合わせありがとうございます（受付番号: {id}）';
const CONTACT_TIMEZONE = 'Asia/Tokyo';
const CONTACT_REQUIRED_FIELDS = ['your-name', 'your-email', 'your-subject', 'your-message'];
const LOG_VERBOSE = true;
const ORDER_TOKEN_TTL_MS = 10 * 60 * 1000;
const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_ALLOWED_MIME = [
  'application/pdf',
  'application/zip',
  'image/png',
  'image/jpeg',
  'application/octet-stream'
];
const ATTACHMENT_ALLOWED_EXT = ['.pdf', '.zip', '.png', '.jpg', '.jpeg', '.ex4'];

// メンテナンス: 商品カタログとクーポンをスプレッドシートで管理する
const PRODUCT_COLUMNS = {
  product_id: 'product_id',
  product_name: 'product_name',
  price: 'price',
  currency: 'currency',
  active: 'active',
  coupon_code: 'coupon_code',
  discount_type: 'discount_type',
  discount_value: 'discount_value',
  valid_from: 'valid_from',
  valid_to: 'valid_to'
};

// POSTリクエストの入口。Webhook/問い合わせ/注文処理へ分岐する。
function doPost(e) {
  try {
    logInfo_('doPost start', summarizeEvent_(e));
    var webhookEvent = extractWebhookEvent_(e);
    if (webhookEvent) {
      logInfo_('route: paypal webhook', { event_type: webhookEvent.event_type });
      return handlePaypalWebhook_(e, webhookEvent);
    }

    var params = (e && e.parameter) ? e.parameter : {};
    var source = params.source || '';
    var action = params.action || '';
    logInfo_('route: params', { source: source, keys: Object.keys(params || {}) });
    if (source === 'contact') {
      return handleContact_(params);
    }
    if (action === 'capture_paypal') {
      return handlePaypalCapture_(params);
    }
    if (action === 'cancel_paypal') {
      return handlePaypalCancel_(params);
    }
    if (action === 'issue_token') {
      return handleIssueToken_(params);
    }

    var payload = normalizeOrderPayload_(e);
    logInfo_('route: payload', summarizeOrderPayload_(payload));
    if (source === 'bank_confirm' || payload.payment_method === 'bank_transfer') {
      return handleBankOrder_(payload);
    }

    if (payload.payment_method === 'paypal') {
      if (payload.action && payload.action !== 'create_order') {
        logWarn_('invalid action', { action: payload.action });
        return jsonResponse_({ ok: false, error: 'invalid_action' });
      }
      return handlePaypalCreateOrder_(payload);
    }

    logWarn_('unknown source', { source: source, payment_method: payload.payment_method });
    return jsonResponse_({ ok: false, error: 'unknown_source' });
  } catch (err) {
    logError_('doPost error', err);
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

// 問い合わせの検証・保存・通知を行う。
function handleContact_(params) {
  logInfo_('handleContact start', summarizeContactParams_(params));
  var missing = CONTACT_REQUIRED_FIELDS.filter(function(key) {
    return !params[key];
  });
  if (missing.length > 0) {
    logWarn_('handleContact missing fields', { missing: missing });
    return jsonResponse_({ ok: false, error: 'missing_fields', fields: missing });
  }

  if (params['signal-file-data'] || params['signal-file-name']) {
    var attachmentCheck = validateAttachment_(params['signal-file-data'], params['signal-file-name']);
    if (!attachmentCheck.ok) {
      logWarn_('handleContact invalid attachment', { error: attachmentCheck.error });
      return jsonResponse_({ ok: false, error: 'invalid_attachment' });
    }
  }

  var now = new Date();
  var receiptId = generateReceiptId_(now);
  logInfo_('handleContact receiptId', { id: receiptId });
  var sheet = getContactSheet_();
  sheet.appendRow([
    receiptId,
    formatContactDate_(now),
    params['your-name'] || '',
    params['your-email'] || '',
    params['your-subject'] || '',
    params['your-message'] || '',
    '未対応',
    '',
    formatContactDate_(now),
    params['signal-file-name'] || ''
  ]);

  sendContactAutoReply_(params, receiptId);
  notifyContactAdmin_(params, receiptId);
  logInfo_('handleContact done', { id: receiptId });
  return jsonResponse_({ ok: true, id: receiptId });
}

// 問い合わせ記録用シートを取得し、必要なら作成/ヘッダ更新する。
function getContactSheet_() {
  logInfo_('getContactSheet start', {});
  var ss = SpreadsheetApp.openById(CONTACT_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONTACT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONTACT_SHEET_NAME);
    sheet.appendRow([
      '受付番号',
      '受付日時',
      '氏名',
      'メール',
      '件名',
      '本文',
      '状態',
      '対応者',
      '最終更新',
      'サインツール'
    ]);
    logInfo_('getContactSheet created', { sheet: CONTACT_SHEET_NAME });
    return sheet;
  }
  if (sheet.getLastRow() > 0) {
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (header.indexOf('サインツール') === -1) {
      sheet.getRange(1, header.length + 1).setValue('サインツール');
      logInfo_('getContactSheet header updated', { added: 'サインツール' });
    }
  }
  return sheet;
}

// 受付番号を日付＋乱数で生成する。
function generateReceiptId_(date) {
  var y = Utilities.formatDate(date, CONTACT_TIMEZONE, 'yyyy');
  var m = Utilities.formatDate(date, CONTACT_TIMEZONE, 'MM');
  var d = Utilities.formatDate(date, CONTACT_TIMEZONE, 'dd');
  var hh = Utilities.formatDate(date, CONTACT_TIMEZONE, 'HH');
  var mm = Utilities.formatDate(date, CONTACT_TIMEZONE, 'mm');
  var ss = Utilities.formatDate(date, CONTACT_TIMEZONE, 'ss');
  var rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return y + m + d + '-' + hh + mm + ss + '-' + rand;
}

// 問い合わせ日時を表示用フォーマットに整形する。
function formatContactDate_(date) {
  return Utilities.formatDate(date, CONTACT_TIMEZONE, 'yyyy/MM/dd HH:mm:ss');
}

// 問い合わせ受付の自動返信メールを送信する。
function sendContactAutoReply_(params, receiptId) {
  var to = params['your-email'] || '';
  if (!to) {
    logWarn_('sendContactAutoReply skipped: missing email', {});
    return;
  }
  logInfo_('sendContactAutoReply', { id: receiptId, email: maskEmail_(to) });

  var subject = CONTACT_REPLY_SUBJECT.replace('{id}', receiptId);
  var body = [
    (params['your-name'] || '') + ' 様',
    '',
    'お問い合わせありがとうございます。以下の内容で受け付けました。',
    '受付番号: ' + receiptId,
    '返信目安: 3日以内（24時間・土日も対応）',
    '',
    '--- 受付内容 ---',
    'お名前: ' + (params['your-name'] || ''),
    'メール: ' + (params['your-email'] || ''),
    'お問い合わせ内容: ' + (params['your-subject'] || ''),
    params['signal-file-name'] ? ('サインツール: ' + params['signal-file-name']) : '',
    'お問い合わせ詳細:',
    (params['your-message'] || ''),
    '----------------',
    ''
  ].join('\n');

  MailApp.sendEmail({
    to: to,
    subject: subject,
    name: CONTACT_REPLY_FROM_NAME,
    body: body
  });
}

// 管理者へ問い合わせ通知メールを送信する。
function notifyContactAdmin_(params, receiptId) {
  if (!CONTACT_ADMIN_EMAIL) {
    logWarn_('notifyContactAdmin skipped: empty admin email', {});
    return;
  }
  logInfo_('notifyContactAdmin', { id: receiptId, to: maskEmail_(CONTACT_ADMIN_EMAIL) });
  var subject = '【新規お問い合わせ】受付番号: ' + receiptId;
  var body = [
    '新しいお問い合わせが届きました。',
    '受付番号: ' + receiptId,
    '',
    'お名前: ' + (params['your-name'] || ''),
    'メール: ' + (params['your-email'] || ''),
    'お問い合わせ内容: ' + (params['your-subject'] || ''),
    params['signal-file-name'] ? ('サインツール: ' + params['signal-file-name']) : '',
    'お問い合わせ詳細:',
    (params['your-message'] || '')
  ].join('\n');

  var options = {
    to: CONTACT_ADMIN_EMAIL,
    subject: subject,
    body: body
  };
  // サインツール添付がある場合のみ管理者メールに添付する。
  if (params['signal-file-data'] && params['signal-file-name']) {
    var blob = buildAttachmentBlob_(params['signal-file-data'], params['signal-file-name']);
    if (blob) {
      options.attachments = [blob];
    }
  }
  MailApp.sendEmail(options);
}

// Base64データURLから添付Blobを作成する。
function buildAttachmentBlob_(dataUrl, filename) {
  try {
    var parts = String(dataUrl || '').split(',');
    if (parts.length < 2) {
      return null;
    }
    var contentType = parts[0].match(/data:(.*);base64/);
    var mime = contentType && contentType[1] ? contentType[1] : 'application/octet-stream';
    var bytes = Utilities.base64Decode(parts[1]);
    return Utilities.newBlob(bytes, mime, filename);
  } catch (err) {
    logWarn_('buildAttachmentBlob failed', { error: String(err) });
    return null;
  }
}

// 添付ファイルの検証を行う。
function validateAttachment_(dataUrl, filename) {
  if (!dataUrl || !filename) {
    return { ok: false, error: 'missing_attachment' };
  }
  var parts = String(dataUrl).split(',');
  if (parts.length < 2) {
    return { ok: false, error: 'invalid_data_url' };
  }
  var meta = parts[0];
  var contentTypeMatch = meta.match(/data:(.*);base64/);
  var mime = contentTypeMatch && contentTypeMatch[1] ? contentTypeMatch[1] : 'application/octet-stream';
  var ext = getFileExtension_(filename);
  if (!isAllowedMime_(mime) || !isAllowedExt_(ext)) {
    return { ok: false, error: 'invalid_attachment_type' };
  }
  var bytes = Utilities.base64Decode(parts[1]);
  if (bytes.length > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: 'attachment_too_large' };
  }
  return { ok: true };
}

function getFileExtension_(filename) {
  var lower = String(filename || '').toLowerCase();
  var idx = lower.lastIndexOf('.');
  return idx !== -1 ? lower.slice(idx) : '';
}

function isAllowedMime_(mime) {
  return ATTACHMENT_ALLOWED_MIME.indexOf(String(mime || '').toLowerCase()) !== -1;
}

function isAllowedExt_(ext) {
  return ATTACHMENT_ALLOWED_EXT.indexOf(String(ext || '').toLowerCase()) !== -1;
}

// 銀行振込注文の登録・通知を行う。
function handleBankOrder_(payload) {
  logInfo_('handleBankOrder start', summarizeOrderPayload_(payload));
  if (!payload.action || payload.action !== 'create_order') {
    logWarn_('handleBankOrder invalid action', { action: payload.action });
    return jsonResponse_({ ok: false, error: 'invalid_action' });
  }
  if (!payload.payment_method) {
    return jsonResponse_({ ok: false, error: 'missing_payment_method' });
  }
  if (payload.payment_method !== 'bank_transfer') {
    logWarn_('handleBankOrder invalid payment method', { payment_method: payload.payment_method });
    return jsonResponse_({ ok: false, error: 'invalid_payment_method' });
  }

  if (!verifyOrderToken_(payload)) {
    return jsonResponse_({ ok: false, error: 'invalid_order_token' });
  }
  validateOrderPayload_(payload);
  var pricing = resolvePricing_(payload);
  payload.product_id = pricing.product_id;
  payload.product_name = pricing.product_name;
  payload.amount = pricing.amount;
  payload.currency = pricing.currency;
  var config = getOrderConfig_();
  var orderId = Utilities.getUuid();
  var now = new Date();

  appendOrder_(config, {
    order_id: orderId,
    paypal_order_id: '',
    status: 'pending_bank_transfer',
    payment_method: 'bank_transfer',
    product_id: payload.product_id,
    product_name: payload.product_name,
    amount: payload.amount,
    currency: payload.currency,
    customer_name: payload.customer.last_name + ' ' + payload.customer.first_name,
    customer_email: payload.customer.email,
    notes: payload.customer.notes || '',
    created_at: now,
    updated_at: now
  });

  sendBankTransferEmail_(config, payload.customer);
  notifyBankOrderAdmin_(orderId, payload, payload.customer);
  logInfo_('handleBankOrder done', { order_id: orderId });
  return jsonResponse_({ ok: true, order_id: orderId });
}

// 銀行振込注文の自動返信メールを送信する。
function sendBankOrderAutoReply_(customer, orderId, payload) {
  // メンテナンス: 利用期間・更新ルールの案内文をメール本文に含める
  if (!customer || !customer.email) {
    logWarn_('sendBankOrderAutoReply skipped: missing email', {});
    return;
  }
  var subject = '【BO-AutoBot】銀行振込のご注文を受け付けました';
  var body = [
    customer.last_name + ' ' + customer.first_name + ' 様',
    '',
    'ご注文ありがとうございます。以下の内容で受け付けました。',
    '注文番号: ' + orderId,
    '商品名: ' + (payload.product_name || ''),
    '金額: ¥' + Number(payload.amount || 0).toLocaleString('ja-JP'),
    '利用期間: 決済日から1年間（自動更新なし／更新は再購入）',
    'お支払い方法: 銀行振込',
    '',
    '振込先のご案内は別メールでお送りしております。',
    'お振込確認後、ダウンロードリンクを記載したメールをお送りします。',
    '',
    'ご不明点がございましたらお問い合わせください。'
  ].join('\n');

  GmailApp.sendEmail(customer.email, subject, body);
  logInfo_('sendBankOrderAutoReply', { email: maskEmail_(customer.email), order_id: orderId });
}

// 銀行振込注文の管理者通知メールを送信する。
function notifyBankOrderAdmin_(orderId, payload, customer) {
  if (!CONTACT_ADMIN_EMAIL) {
    logWarn_('notifyBankOrderAdmin skipped: empty admin email', {});
    return;
  }
  var subject = '【銀行振込】新規注文: ' + orderId;
  var body = [
    '銀行振込の注文が確定しました。',
    '注文番号: ' + orderId,
    '商品名: ' + (payload.product_name || ''),
    '金額: ¥' + Number(payload.amount || 0).toLocaleString('ja-JP'),
    '支払方法: 銀行振込',
    '',
    '購入者名: ' + (customer.last_name || '') + ' ' + (customer.first_name || ''),
    '購入者メール: ' + (customer.email || ''),
    '備考: ' + (customer.notes || '')
  ].join('\n');

  GmailApp.sendEmail(CONTACT_ADMIN_EMAIL, subject, body);
  logInfo_('notifyBankOrderAdmin', { to: maskEmail_(CONTACT_ADMIN_EMAIL), order_id: orderId });
}

// PayPal注文作成を行い、承認URLを返す。
function handlePaypalCreateOrder_(payload) {
  logInfo_('handlePaypalCreateOrder start', summarizeOrderPayload_(payload));
  var config = getOrderConfig_();
  validateOrderPayload_(payload);
  if (!verifyOrderToken_(payload)) {
    return jsonResponse_({ ok: false, error: 'invalid_order_token' });
  }
  var pricing = resolvePricing_(payload);
  payload.product_id = pricing.product_id;
  payload.product_name = pricing.product_name;
  payload.amount = pricing.amount;
  payload.currency = pricing.currency;

  if (payload.payment_method !== 'paypal') {
    logWarn_('handlePaypalCreateOrder invalid payment method', { payment_method: payload.payment_method });
    return jsonResponse_({ ok: false, error: 'invalid_payment_method' });
  }

  var orderId = Utilities.getUuid();
  var now = new Date();
  var paypalResponse = createPayPalOrder_(payload, orderId, config);
  var paypalOrderId = paypalResponse.id;
  var approvalUrl = extractApprovalUrl_(paypalResponse);
  logInfo_('handlePaypalCreateOrder created', { order_id: orderId, paypal_order_id: paypalOrderId, has_approval_url: !!approvalUrl });

  appendOrder_(config, {
    order_id: orderId,
    paypal_order_id: paypalOrderId,
    status: 'pending_payment',
    payment_method: 'paypal',
    product_id: payload.product_id,
    product_name: payload.product_name,
    amount: payload.amount,
    currency: payload.currency,
    customer_name: payload.customer.last_name + ' ' + payload.customer.first_name,
    customer_email: payload.customer.email,
    notes: payload.customer.notes || '',
    created_at: now,
    updated_at: now
  });

  if (!approvalUrl) {
    logWarn_('handlePaypalCreateOrder missing approval url', { order_id: orderId });
    return jsonResponse_({ ok: false, error: 'missing_approval_url' });
  }
  return jsonResponse_({
    ok: true,
    approval_url: approvalUrl,
    order_id: orderId,
    paypal_order_id: paypalOrderId
  });
}

// PayPalの承認後にCAPTUREを実行する。
function handlePaypalCapture_(params) {
  logInfo_('handlePaypalCapture start', { keys: Object.keys(params || {}) });
  var config = getOrderConfig_();
  var paypalOrderId = params.token || params.paypal_order_id || '';
  if (!paypalOrderId) {
    return jsonResponse_({ ok: false, error: 'missing_order_id' });
  }
  var capture = capturePayPalOrder_(paypalOrderId, config);
  if (!capture || capture.status !== 'COMPLETED') {
    logWarn_('handlePaypalCapture incomplete', { paypal_order_id: paypalOrderId, status: capture && capture.status });
    return jsonResponse_({ ok: false, error: 'capture_incomplete' });
  }
  var order = updateOrderStatus_(config, paypalOrderId, 'paid');
  if (order && order.customer_email && order.previous_status !== 'paid') {
    sendPaypalHoldEmail_(order.customer_email, order.customer_name);
    notifyPaypalOrderAdmin_(paypalOrderId, order);
  }
  logInfo_('handlePaypalCapture done', { paypal_order_id: paypalOrderId });
  return jsonResponse_({ ok: true, status: capture.status });
}

// PayPal Webhookを検証し、入金確定時にステータス更新と送付メールを行う。
function handlePaypalWebhook_(e, event) {
  logInfo_('handlePaypalWebhook start', { event_type: event.event_type });
  var config = getOrderConfig_();
  if (!event || !event.event_type) {
    return jsonResponse_({ status: 'ignored' });
  }

  if (!verifyWebhook_(e, event, config)) {
    logWarn_('handlePaypalWebhook verify failed', {});
    return jsonResponse_({ status: 'invalid' });
  }

  if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
    return jsonResponse_({ status: 'received' });
  }

  var paypalOrderId = extractOrderIdFromEvent_(event);
  if (!paypalOrderId) {
    logWarn_('handlePaypalWebhook missing paypal_order_id', {});
    return jsonResponse_({ status: 'missing_order_id' });
  }

  var order = updateOrderStatus_(config, paypalOrderId, 'paid');
  if (order && order.customer_email && order.previous_status !== 'paid') {
    sendPaypalHoldEmail_(order.customer_email, order.customer_name);
    notifyPaypalOrderAdmin_(paypalOrderId, order);
  }
  logInfo_('handlePaypalWebhook done', { paypal_order_id: paypalOrderId });
  return jsonResponse_({ status: 'ok' });
}

// Webhookのリクエスト本文からイベントJSONを抽出する。
function extractWebhookEvent_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return null;
  }
  try {
    var parsed = JSON.parse(e.postData.contents);
    if (parsed && parsed.event_type) {
      return parsed;
    }
  } catch (err) {
    return null;
  }
  return null;
}

// パラメータ/JSON入力を注文ペイロードに正規化する。
function normalizeOrderPayload_(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  if (params && params.action) {
    logInfo_('normalizeOrderPayload from params', { keys: Object.keys(params || {}) });
    return {
      action: params.action,
      source: params.source || '',
      product_id: params.product_id,
      product_name: params.product_name,
      amount: Number(params.amount),
      currency: params.currency,
      coupon_code: params.coupon_code || '',
      order_token: params.order_token || '',
      payment_method: params.payment_method,
      customer: {
        first_name: params.billing_first_name || '',
        last_name: params.billing_last_name || '',
        email: params.billing_email || '',
        notes: params.order_comments || ''
      }
    };
  }

  var body = {};
  if (e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
      logInfo_('normalizeOrderPayload from json', { keys: Object.keys(body || {}) });
    } catch (err) {
      logWarn_('normalizeOrderPayload json parse failed', {});
      body = {};
    }
  }
  return body || {};
}

// 注文ペイロードの必須項目を検証する。
function validateOrderPayload_(payload) {
  if (!payload || !payload.customer) {
    logWarn_('validateOrderPayload invalid payload', {});
    throw new Error('invalid_payload');
  }
  if (!payload.customer.first_name || !payload.customer.last_name || !payload.customer.email) {
    logWarn_('validateOrderPayload missing customer', {});
    throw new Error('missing_customer');
  }
  if (!payload.product_id) {
    logWarn_('validateOrderPayload missing product', {});
    throw new Error('missing_product');
  }
}

// スクリプトプロパティから注文関連の設定値を取得する。
function getOrderConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    SHEET_ID: props.getProperty('SHEET_ID'),
    SHEET_NAME: props.getProperty('SHEET_NAME') || 'orders',
    BANK_NAME: props.getProperty('BANK_NAME'),
    BANK_BRANCH: props.getProperty('BANK_BRANCH'),
    BANK_TYPE: props.getProperty('BANK_TYPE'),
    BANK_NUMBER: props.getProperty('BANK_NUMBER'),
    BANK_HOLDER: props.getProperty('BANK_HOLDER'),
    PAYPAL_CLIENT_ID: props.getProperty('PAYPAL_CLIENT_ID'),
    PAYPAL_CLIENT_SECRET: props.getProperty('PAYPAL_CLIENT_SECRET'),
    PAYPAL_WEBHOOK_ID: props.getProperty('PAYPAL_WEBHOOK_ID'),
    PAYPAL_ENV: props.getProperty('PAYPAL_ENV') || 'sandbox',
    PAYPAL_RETURN_URL: props.getProperty('PAYPAL_RETURN_URL'),
    PAYPAL_CANCEL_URL: props.getProperty('PAYPAL_CANCEL_URL'),
    PRODUCT_DOWNLOAD_URL: props.getProperty('PRODUCT_DOWNLOAD_URL') || 'https://example.com/download',
    PRODUCT_DOWNLOAD_FILE_ID: props.getProperty('PRODUCT_DOWNLOAD_FILE_ID'),
    PRODUCT_DOWNLOAD_URL_DEMO: props.getProperty('PRODUCT_DOWNLOAD_URL_DEMO') || 'https://drive.google.com/file/d/1A9l8Y5tzHZ_lSe8j_8WbuKYwT0j31UQB/view?usp=sharing',
    PRODUCT_DOWNLOAD_FILE_ID_DEMO: props.getProperty('PRODUCT_DOWNLOAD_FILE_ID_DEMO')
  };
}

// 注文情報をシートへ追記する。
function appendOrder_(config, data) {
  logInfo_('appendOrder', { order_id: data.order_id, payment_method: data.payment_method });
  var sheet = getOrderSheet_(config);
  var headers = [
    'order_id',
    'paypal_order_id',
    'status',
    'payment_method',
    'product_id',
    'product_name',
    'amount',
    'currency',
    'customer_name',
    'customer_email',
    'notes',
    'created_at',
    'updated_at'
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  sheet.appendRow([
    data.order_id,
    data.paypal_order_id,
    data.status,
    data.payment_method,
    data.product_id,
    data.product_name,
    data.amount,
    data.currency,
    data.customer_name,
    data.customer_email,
    data.notes,
    data.created_at,
    data.updated_at
  ]);
}

// 注文記録用シートを取得する。
function getOrderSheet_(config) {
  var ss = SpreadsheetApp.openById(config.SHEET_ID);
  return ss.getSheetByName(config.SHEET_NAME);
}

// 銀行振込の案内メールを送信する。
function sendBankTransferEmail_(config, customer) {
  // メンテナンス: 利用期間・更新ルールの案内文をメール本文に含める
  logInfo_('sendBankTransferEmail', { email: maskEmail_(customer.email) });
  var subject = '【BO-AutoBot】銀行振込のご案内';
  var body = customer.last_name + ' ' + customer.first_name + ' 様\n\n' +
    'ご注文ありがとうございます。以下の口座へお振込をお願いいたします。\n\n' +
    '銀行名：' + config.BANK_NAME + '\n' +
    '支店名：' + config.BANK_BRANCH + '\n' +
    '口座種別：' + config.BANK_TYPE + '\n' +
    '口座番号：' + config.BANK_NUMBER + '\n' +
    '口座名義：' + config.BANK_HOLDER + '\n\n' +
    '利用期間は決済日から1年間です（自動更新なし／更新は再購入）。\n' +
    'お振込は原則3日以内にお手続きいただけますと幸いです。\n' +
    'お振込の確認後、入力いただいたメールアドレス宛にダウンロードリンクを記載したメールをお送りいたします。\n' +
    'お振込確認は毎日行っておりますが、確認のタイミングによってはご連絡が遅れる場合がございます。\n' +
    '公式LINEにてお振込のご連絡をいただけますと、確認がスムーズです。\n\n' +
    'ご入金確認後、商品をお送りいたします。';
  GmailApp.sendEmail(customer.email, subject, body);
}

// 注文トークンを発行する。
function handleIssueToken_(params) {
  try {
    var productId = params.product_id || '';
    var couponCode = params.coupon_code || '';
    var product = getProductById_(productId);
    if (!product || !String(product[PRODUCT_COLUMNS.active]).match(/^(true|1|yes|active)$/i)) {
      return jsonResponse_({ ok: false, error: 'product_inactive' });
    }
    var couponCheck = applyCoupon_(product, couponCode);
    if (!couponCheck.ok) {
      return jsonResponse_({ ok: false, error: couponCheck.error });
    }
    var token = issueOrderToken_(productId, couponCode);
    return jsonResponse_({ ok: true, token: token });
  } catch (err) {
    logError_('handleIssueToken error', err);
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

// 注文トークンを検証する。
function verifyOrderToken_(payload) {
  if (!payload || !payload.order_token) {
    return false;
  }
  var secret = getOrderTokenSecret_();
  if (!secret) {
    logWarn_('verifyOrderToken missing secret', {});
    return false;
  }
  var parts = String(payload.order_token).split('.');
  if (parts.length !== 2) {
    return false;
  }
  var payloadB64 = parts[0];
  var sig = parts[1];
  var expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payloadB64, secret)
  );
  if (expected !== sig) {
    return false;
  }
  var decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString();
  var data = JSON.parse(decoded);
  if (!data || !data.iat || !data.product_id) {
    return false;
  }
  if (data.product_id !== payload.product_id) {
    return false;
  }
  if (String(data.coupon_code || '') !== String(payload.coupon_code || '')) {
    return false;
  }
  if (Date.now() - Number(data.iat) > ORDER_TOKEN_TTL_MS) {
    return false;
  }
  return true;
}

// 注文トークンを生成する。
function issueOrderToken_(productId, couponCode) {
  var secret = getOrderTokenSecret_();
  if (!secret) {
    throw new Error('missing_order_token_secret');
  }
  var payload = JSON.stringify({
    product_id: String(productId || ''),
    coupon_code: String(couponCode || ''),
    iat: Date.now()
  });
  var payloadB64 = Utilities.base64EncodeWebSafe(payload);
  var sig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payloadB64, secret)
  );
  return payloadB64 + '.' + sig;
}

// トークン署名の秘密鍵を取得する。
function getOrderTokenSecret_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('ORDER_TOKEN_SECRET');
}

// 商品カタログシートを取得する。
function getProductSheet_() {
  var ss = SpreadsheetApp.openById(getOrderConfig_().SHEET_ID);
  return ss.getSheetByName(PRODUCT_SHEET_NAME);
}

// 商品カタログの1行を読み取る。
function getProductById_(productId) {
  var sheet = getProductSheet_();
  if (!sheet) {
    throw new Error('product_sheet_not_found');
  }
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('product_empty');
  }
  var header = values[0];
  var idIndex = header.indexOf(PRODUCT_COLUMNS.product_id);
  if (idIndex === -1) {
    throw new Error('product_header_invalid');
  }
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIndex]) === String(productId)) {
      return mapProductRow_(header, values[i]);
    }
  }
  return null;
}

// 商品行をオブジェクトへマッピングする。
function mapProductRow_(header, row) {
  var obj = {};
  for (var i = 0; i < header.length; i++) {
    obj[header[i]] = row[i];
  }
  return obj;
}

// クーポン適用後の金額を算出する。
function applyCoupon_(product, couponCode) {
  var price = Number(product[PRODUCT_COLUMNS.price]);
  if (!couponCode) {
    return { ok: true, amount: price, coupon_applied: false };
  }
  var code = String(couponCode || '').trim().toLowerCase();
  var productCode = String(product[PRODUCT_COLUMNS.coupon_code] || '').trim().toLowerCase();
  if (!productCode || productCode !== code) {
    return { ok: false, error: 'invalid_coupon' };
  }

  var type = String(product[PRODUCT_COLUMNS.discount_type] || '').trim();
  var value = Number(product[PRODUCT_COLUMNS.discount_value] || 0);
  var now = new Date();
  var validFrom = product[PRODUCT_COLUMNS.valid_from] ? new Date(product[PRODUCT_COLUMNS.valid_from]) : null;
  var validTo = product[PRODUCT_COLUMNS.valid_to] ? new Date(product[PRODUCT_COLUMNS.valid_to]) : null;
  if (validFrom && now < validFrom) {
    return { ok: false, error: 'coupon_not_started' };
  }
  if (validTo && now > validTo) {
    return { ok: false, error: 'coupon_expired' };
  }
  if (type === 'percent') {
    var percent = Math.max(0, Math.min(100, value));
    return { ok: true, amount: Math.max(0, Math.floor(price * (100 - percent) / 100)), coupon_applied: true };
  }
  if (type === 'fixed') {
    return { ok: true, amount: Math.max(0, price - value), coupon_applied: true };
  }
  return { ok: false, error: 'invalid_discount_type' };
}

// 商品カタログを参照して価格/通貨を確定する。
function resolvePricing_(payload) {
  var product = getProductById_(payload.product_id);
  if (!product) {
    throw new Error('product_not_found');
  }
  if (!String(product[PRODUCT_COLUMNS.active]).match(/^(true|1|yes|active)$/i)) {
    throw new Error('product_inactive');
  }
  var result = applyCoupon_(product, payload.coupon_code || '');
  if (!result.ok) {
    throw new Error(result.error);
  }
  return {
    product_id: String(product[PRODUCT_COLUMNS.product_id]),
    product_name: String(product[PRODUCT_COLUMNS.product_name]),
    amount: Number(result.amount),
    currency: String(product[PRODUCT_COLUMNS.currency] || 'JPY'),
    coupon_applied: !!result.coupon_applied
  };
}

// PayPalの注文作成APIを呼び出す。
function createPayPalOrder_(payload, orderId, config) {
  logInfo_('createPayPalOrder start', { order_id: orderId });
  var accessToken = getPayPalAccessToken_(config);
  var url = getPayPalApiBase_(config) + '/v2/checkout/orders';
  var requestBody = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: payload.product_id,
        description: payload.product_name,
        custom_id: orderId,
        amount: {
          currency_code: payload.currency,
          value: String(payload.amount)
        }
      }
    ],
    application_context: {
      return_url: config.PAYPAL_RETURN_URL,
      cancel_url: config.PAYPAL_CANCEL_URL,
      brand_name: 'BO-AutoBot',
      landing_page: 'LOGIN',
      user_action: 'PAY_NOW'
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + accessToken
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 400) {
    logWarn_('createPayPalOrder failed', { status: response.getResponseCode() });
    throw new Error('paypal_order_failed');
  }
  return JSON.parse(response.getContentText());
}

// 承認済みPayPal注文をCAPTUREする。
function capturePayPalOrder_(paypalOrderId, config) {
  logInfo_('capturePayPalOrder start', { paypal_order_id: paypalOrderId });
  var accessToken = getPayPalAccessToken_(config);
  var url = getPayPalApiBase_(config) + '/v2/checkout/orders/' + paypalOrderId + '/capture';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + accessToken
    },
    payload: '{}',
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 400) {
    logWarn_('capturePayPalOrder failed', { status: response.getResponseCode() });
    throw new Error('paypal_capture_failed');
  }
  return JSON.parse(response.getContentText());
}

// PayPalレスポンスから承認URLを抽出する。
function extractApprovalUrl_(paypalResponse) {
  if (!paypalResponse || !paypalResponse.links) {
    return '';
  }
  for (var i = 0; i < paypalResponse.links.length; i++) {
    if (paypalResponse.links[i].rel === 'approve') {
      return paypalResponse.links[i].href;
    }
  }
  return '';
}

// PayPal Webhook署名の検証を行う。
function verifyWebhook_(e, event, config) {
  logInfo_('verifyWebhook start', {});
  var headers = (e && e.headers) ? e.headers : null;
  if (!headers) {
    return false;
  }

  var payload = {
    auth_algo: getHeader_(headers, 'paypal-auth-algo'),
    cert_url: getHeader_(headers, 'paypal-cert-url'),
    transmission_id: getHeader_(headers, 'paypal-transmission-id'),
    transmission_sig: getHeader_(headers, 'paypal-transmission-sig'),
    transmission_time: getHeader_(headers, 'paypal-transmission-time'),
    webhook_id: config.PAYPAL_WEBHOOK_ID,
    webhook_event: event
  };

  if (!payload.auth_algo || !payload.cert_url || !payload.transmission_id ||
      !payload.transmission_sig || !payload.transmission_time) {
    return false;
  }

  var accessToken = getPayPalAccessToken_(config);
  var url = getPayPalApiBase_(config) + '/v1/notifications/verify-webhook-signature';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + accessToken
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 400) {
    logWarn_('verifyWebhook failed', { status: response.getResponseCode() });
    return false;
  }
  var result = JSON.parse(response.getContentText());
  return result.verification_status === 'SUCCESS';
}

// PayPal APIのアクセストークンを取得する。
function getPayPalAccessToken_(config) {
  logInfo_('getPayPalAccessToken start', {});
  var url = getPayPalApiBase_(config) + '/v1/oauth2/token';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(config.PAYPAL_CLIENT_ID + ':' + config.PAYPAL_CLIENT_SECRET)
    },
    payload: {
      grant_type: 'client_credentials'
    },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 400) {
    logWarn_('getPayPalAccessToken failed', { status: response.getResponseCode() });
    throw new Error('paypal_token_failed');
  }
  return JSON.parse(response.getContentText()).access_token;
}

// PayPal環境に応じたAPIベースURLを返す。
function getPayPalApiBase_(config) {
  return config.PAYPAL_ENV === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

// WebhookイベントからPayPal注文IDを抽出する。
function extractOrderIdFromEvent_(event) {
  if (event.resource && event.resource.supplementary_data &&
      event.resource.supplementary_data.related_ids &&
      event.resource.supplementary_data.related_ids.order_id) {
    return event.resource.supplementary_data.related_ids.order_id;
  }
  return '';
}

// 注文ステータスを更新し、購入者情報を返す。
function updateOrderStatus_(config, paypalOrderId, status) {
  logInfo_('updateOrderStatus start', { paypal_order_id: paypalOrderId, status: status });
  var sheet = getOrderSheet_(config);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return null;
  }

  var header = values[0];
  var paypalIndex = header.indexOf('paypal_order_id');
  var statusIndex = header.indexOf('status');
  var updatedIndex = header.indexOf('updated_at');
  var emailIndex = header.indexOf('customer_email');
  var nameIndex = header.indexOf('customer_name');
  var productIndex = header.indexOf('product_name');
  var amountIndex = header.indexOf('amount');
  var currencyIndex = header.indexOf('currency');

  for (var i = 1; i < values.length; i++) {
    if (values[i][paypalIndex] === paypalOrderId) {
      var previousStatus = values[i][statusIndex];
      sheet.getRange(i + 1, statusIndex + 1).setValue(status);
      sheet.getRange(i + 1, updatedIndex + 1).setValue(new Date());
      return {
        previous_status: previousStatus,
        customer_email: values[i][emailIndex],
        customer_name: values[i][nameIndex],
        product_name: productIndex !== -1 ? values[i][productIndex] : '',
        amount: amountIndex !== -1 ? values[i][amountIndex] : '',
        currency: currencyIndex !== -1 ? values[i][currencyIndex] : ''
      };
    }
  }
  logWarn_('updateOrderStatus not found', { paypal_order_id: paypalOrderId });
  return null;
}

// 商品IDに応じたダウンロード情報を返す。
function resolveDownloadConfig_(config, productId) {
  if (productId === 'bo-autobot-demo') {
    return {
      url: config.PRODUCT_DOWNLOAD_URL_DEMO || config.PRODUCT_DOWNLOAD_URL,
      fileId: config.PRODUCT_DOWNLOAD_FILE_ID_DEMO || config.PRODUCT_DOWNLOAD_FILE_ID
    };
  }
  return {
    url: config.PRODUCT_DOWNLOAD_URL,
    fileId: config.PRODUCT_DOWNLOAD_FILE_ID
  };
}

// 商品ダウンロード案内メールを送信する。
function sendProductEmail_(config, email, name, productId) {
  // メンテナンス: 利用期間・更新ルールの案内文をメール本文に含める
  logInfo_('sendProductEmail', { email: maskEmail_(email) });
  var download = resolveDownloadConfig_(config, productId);
  var subject = '【BO-AutoBot】商品送付のご案内';
  var body = name + ' 様\n\n' +
    'BO-AutoBotのご購入ありがとうございます。\n' +
    '以下より商品をお受け取りください。\n\n' +
    'ダウンロードURL：\n' + download.url + '\n\n' +
    '利用期間は決済日から1年間です（自動更新なし／更新は再購入）。\n' +
    'ご不明点がございましたらお問い合わせください。';
  GmailApp.sendEmail(email, subject, body);
}

// PayPal決済完了時に手動送付の案内メールを送信する。
function sendPaypalHoldEmail_(email, name) {
  // メンテナンス: 利用期間・更新ルールの案内文をメール本文に含める
  if (!email) {
    return;
  }
  logInfo_('sendPaypalHoldEmail', { email: maskEmail_(email) });
  var subject = '【BO-AutoBot】ご注文完了のご連絡';
  var body = (name || '') + ' 様\n\n' +
    'ご注文ありがとうございます。\n' +
    '決済が正常に行われているか確認でき次第、ダウンロードリンクをお送りします。\n' +
    '利用期間は決済日から1年間です（自動更新なし／更新は再購入）。\n' +
    '手動での確認になりますので、送付まで少々お時間をいただく場合があります。\n' +
    '2日以上経ってもメールが届かない場合はお問い合わせください。\n\n' +
    'ご不明点がございましたらお問い合わせください。';
  GmailApp.sendEmail(email, subject, body);
}

// 指定ファイルに閲覧権限を付与する。
function grantProductDownloadViewer_(config, email, productId) {
  // 設定されたファイルに対して閲覧権限のみを付与する。
  var download = resolveDownloadConfig_(config, productId);
  if (!download.fileId) {
    logWarn_('grantProductDownloadViewer skipped: empty file id', {});
    return true;
  }
  try {
    var file = DriveApp.getFileById(download.fileId);
    file.addViewer(email);
    logInfo_('grantProductDownloadViewer ok', {
      email: maskEmail_(email),
      file_id: download.fileId
    });
    return true;
  } catch (err) {
    logError_('grantProductDownloadViewer failed', err);
    return false;
  }
}

// PayPal決済完了時に管理者へ通知メールを送信する。
function notifyPaypalOrderAdmin_(paypalOrderId, order) {
  if (!CONTACT_ADMIN_EMAIL) {
    logWarn_('notifyPaypalOrderAdmin skipped: empty admin email', {});
    return;
  }
  var subject = '【PayPal】決済完了: ' + paypalOrderId;
  var body = [
    'PayPal決済が完了しました。',
    'PayPal注文ID: ' + paypalOrderId,
    '購入者名: ' + (order.customer_name || ''),
    '購入者メール: ' + (order.customer_email || ''),
    '商品名: ' + (order.product_name || ''),
    '金額: ' + (order.amount || '') + ' ' + (order.currency || '')
  ].join('\n');

  GmailApp.sendEmail(CONTACT_ADMIN_EMAIL, subject, body);
  logInfo_('notifyPaypalOrderAdmin', { to: maskEmail_(CONTACT_ADMIN_EMAIL), paypal_order_id: paypalOrderId });
}

// PayPalキャンセル時に注文ステータスを更新する。
function handlePaypalCancel_(params) {
  var config = getOrderConfig_();
  var paypalOrderId = params.paypal_order_id || params.token || '';
  if (!paypalOrderId) {
    return jsonResponse_({ ok: false, error: 'missing_order_id' });
  }

  var sheet = getOrderSheet_(config);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return jsonResponse_({ ok: false, error: 'order_not_found' });
  }
  var header = values[0];
  var paypalIndex = header.indexOf('paypal_order_id');
  var statusIndex = header.indexOf('status');
  var updatedIndex = header.indexOf('updated_at');
  if (paypalIndex === -1 || statusIndex === -1) {
    return jsonResponse_({ ok: false, error: 'missing_columns' });
  }

  for (var i = 1; i < values.length; i++) {
    if (values[i][paypalIndex] === paypalOrderId) {
      var currentStatus = values[i][statusIndex];
      if (currentStatus === 'paid') {
        return jsonResponse_({ ok: true, status: 'paid', skipped: true });
      }
      sheet.getRange(i + 1, statusIndex + 1).setValue('cancel');
      if (updatedIndex !== -1) {
        sheet.getRange(i + 1, updatedIndex + 1).setValue(new Date());
      }
      return jsonResponse_({ ok: true, status: 'cancel' });
    }
  }

  return jsonResponse_({ ok: false, error: 'order_not_found' });
}

// 入金済みかつ未送付の注文に対して、ダウンロード案内を送信する。
function sendBankTransferDownloadEmail() {
  // 対象注文に閲覧権限を付与してから案内メールを送信する。
  var config = getOrderConfig_();
  var sheet = getOrderSheet_(config);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return;
  }

  var header = values[0];
  var statusIndex = header.indexOf('status');
  var emailIndex = header.indexOf('customer_email');
  var nameIndex = header.indexOf('customer_name');
  var sentIndex = header.indexOf('download_sent_at');
  var productIdIndex = header.indexOf('product_id');

  if (sentIndex === -1) {
    sheet.getRange(1, header.length + 1).setValue('download_sent_at');
    sentIndex = header.length;
  }

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var status = row[statusIndex];
    var email = row[emailIndex];
    var name = row[nameIndex];
    var sentAt = row[sentIndex];
    var productId = productIdIndex !== -1 ? row[productIdIndex] : '';

    if (status !== 'paid') {
      continue;
    }
    if (!email || sentAt) {
      continue;
    }
    if (!grantProductDownloadViewer_(config, email, productId)) {
      continue;
    }
    sendProductEmail_(config, email, name || '', productId);
    sheet.getRange(i + 1, sentIndex + 1).setValue(new Date());
  }
}

// 即時リダイレクトするHTMLレスポンスを返す。
function redirectResponse_(url) {
  if (!url) {
    return htmlResponse_('遷移先URLが設定されていません。');
  }
  var html = '<!doctype html><html><head><meta charset="UTF-8">' +
    '<meta http-equiv="refresh" content="0;URL=' + url + '">' +
    '<script>window.location.replace("' + url + '");</script>' +
    '</head><body>Redirecting...<br><a href="' + url + '">Continue</a></body></html>';
  return HtmlService.createHtmlOutput(html);
}

// 単純なHTMLレスポンスを返す。
function htmlResponse_(message) {
  return HtmlService.createHtmlOutput('<!doctype html><html><body>' + message + '</body></html>');
}

// ヘッダ名を大小無視で取得する。
function getHeader_(headers, name) {
  var lowerName = name.toLowerCase();
  for (var key in headers) {
    if (headers.hasOwnProperty(key) && key.toLowerCase() === lowerName) {
      return headers[key];
    }
  }
  return '';
}

// JSONレスポンスを返す。
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 情報ログを出力する（詳細ログON時のみ）。
function logInfo_(message, data) {
  if (!LOG_VERBOSE) {
    return;
  }
  Logger.log('[INFO] %s %s', message, JSON.stringify(data || {}));
}

// 警告ログを出力する。
function logWarn_(message, data) {
  Logger.log('[WARN] %s %s', message, JSON.stringify(data || {}));
}

// エラーログを出力する。
function logError_(message, err) {
  Logger.log('[ERROR] %s %s', message, String(err));
}

// イベントの概要情報をログ用に要約する。
function summarizeEvent_(e) {
  if (!e) {
    return { hasEvent: false };
  }
  return {
    hasEvent: true,
    hasPostData: !!(e.postData && e.postData.contents),
    paramKeys: e.parameter ? Object.keys(e.parameter) : []
  };
}

// 問い合わせパラメータをマスクして要約する。
function summarizeContactParams_(params) {
  return {
    name: maskName_(params['your-name']),
    email: maskEmail_(params['your-email']),
    subject: params['your-subject'] || '',
    hasMessage: !!params['your-message'],
    hasSignal: !!params['your-signal']
  };
}

// 注文ペイロードをマスクして要約する。
function summarizeOrderPayload_(payload) {
  if (!payload) {
    return { hasPayload: false };
  }
  return {
    action: payload.action || '',
    payment_method: payload.payment_method || '',
    amount: payload.amount || '',
    currency: payload.currency || '',
    customer_email: payload.customer ? maskEmail_(payload.customer.email) : '',
    hasCustomer: !!payload.customer
  };
}

// メールアドレスをマスクする。
function maskEmail_(email) {
  if (!email) {
    return '';
  }
  var parts = String(email).split('@');
  if (parts.length !== 2) {
    return '***';
  }
  var name = parts[0];
  var domain = parts[1];
  var masked = name.length > 2 ? name.slice(0, 2) + '***' : '***';
  return masked + '@' + domain;
}

// 氏名をマスクする。
function maskName_(name) {
  if (!name) {
    return '';
  }
  var str = String(name);
  if (str.length <= 1) {
    return '*';
  }
  return str.slice(0, 1) + '***';
}
