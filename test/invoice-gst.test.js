var test = require('node:test');
var assert = require('node:assert/strict');

var pricing = require('../lib/pricing');
var tax = require('../lib/tax');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

test('invoice figures match the GST and total recorded when an HSN order is billed', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var billed = pricing.computeTotals(items, '');
  var printed = invoice.computeInvoiceFigures({
    items: items,
    coupon: '',
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  });

  assert.equal(printed.subtotal, billed.subtotal);
  assert.equal(printed.discount, billed.discount);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.cgst, billed.cgst);
  assert.equal(printed.sgst, billed.sgst);
  assert.equal(printed.total, billed.total);
});

test('invoice uses the HSN slab applied by order pricing', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var billed = pricing.computeTotals(items, '');
  var printed = invoice.computeInvoiceFigures({
    id: 1,
    items: items,
    coupon: ''
  });

  assert.equal(billed.tax, 5);
  assert.equal(billed.total, 105);
  assert.equal(printed.tax, 5);
  assert.equal(printed.total, 105);
});

test('invoice handles decimal gstRate the same way as order pricing', function () {
  var item = { id: 2, name: 'Rice', hsn: '1006', gstRate: 0.05, price: 100, qty: 1 };
  var billed = pricing.computeTotals([item], '');
  var printed = invoice.computeInvoiceFigures({ items: [item], coupon: '' });

  assert.equal(tax.getRateForItem(item), 0.05);
  assert.equal(billed.tax, 5);
  assert.equal(printed.rows[0].gstPercent, 5);
  assert.equal(printed.tax, 5);
});

test('invoice applies the same coupon cap, discount base, GST, and total as order pricing', function () {
  var items = [{ id: 3, name: 'Rice', hsn: '1006', price: 2500, qty: 1 }];
  var billed = pricing.computeTotals(items, 'SAVE10');
  var printed = invoice.computeInvoiceFigures({
    items: items,
    coupon: 'SAVE10'
  });

  assert.equal(billed.discount, 150);
  assert.equal(billed.tax, 117.5);
  assert.equal(billed.total, 2467.5);

  assert.equal(printed.discount, 150);
  assert.equal(printed.tax, 117.5);
  assert.equal(printed.total, 2467.5);
});

test('invoice GST total equals the sum of displayed line GST amounts', function () {
  var printed = invoice.computeInvoiceFigures({
    items: [
      { name: 'Item A', gstRate: 5, price: 0.1, qty: 1 },
      { name: 'Item B', gstRate: 5, price: 0.1, qty: 1 }
    ],
    coupon: ''
  });

  assert.deepEqual(printed.rows.map(function (row) { return row.lineTax; }), [0.01, 0.01]);
  assert.equal(printed.rows.reduce(function (sum, row) { return sum + row.lineTax; }, 0), 0.02);
  assert.equal(printed.tax, 0.02);
});

test('CURRENT BEHAVIOUR: GST reconciliation omits cancelled orders', function () {
  var active = {
    id: 10,
    date: '01/01/2022',
    status: 'completed',
    customer: 'In-memory customer',
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
    subtotal: 100,
    discount: 0,
    tax: 5,
    total: 105
  };
  var cancelled = {
    id: 11,
    status: 'cancelled',
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
    subtotal: 100,
    discount: 0,
    tax: 5,
    total: 105
  };

  var result = reports.getGstReconciliation({ orders: [active, cancelled] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].orderId, 10);
  assert.equal(result.rows[0].invoiceTax, 5);
  assert.equal(result.rows[0].invoiceTotal, 105);
});
