from decimal import Decimal

from src.api.uploads import aggregate_line_items


def line(sku, qty, price, amount):
    return {"sku": sku, "item_name": sku, "qty": qty, "price": price, "amount": amount}


def test_keeps_the_printed_unit_price_when_the_line_total_is_rounded():
    # Hóa đơn ghi đơn giá 14.000 nhưng thành tiền làm tròn 4.059.504: đơn giá không được đổi thành 13.998,29.
    [item] = aggregate_line_items([line("A", 290, 14000, 4059504)])
    assert item["price"] == Decimal("14000")
    assert item["amount"] == Decimal("4059504")


def test_keeps_the_price_when_merged_rows_share_it():
    [item] = aggregate_line_items([line("A", 2, 100, 200), line("A", 3, 100, 300)])
    assert item["qty"] == Decimal("5")
    assert item["price"] == Decimal("100")


def test_averages_when_merged_rows_have_different_prices():
    [item] = aggregate_line_items([line("A", 1, 100, 100), line("A", 1, 300, 300)])
    assert item["price"] == Decimal("200")
