from src.services.reconciliation_engine import calculate_grn_subtotal, find_matching_item


def item(name, sku=None, qty=1, price=1000):
    return {"item_name": name, "sku": sku, "qty": qty, "price": price}


def test_exact_name_wins_over_a_name_that_merely_contains_it():
    candidates = [item("Dây điện đơn gói 100"), item("Dây điện đơn gói 10")]
    assert find_matching_item(item("Dây điện đơn gói 10"), candidates)["item_name"] == "Dây điện đơn gói 10"
    assert find_matching_item("Dây điện đơn gói 100", candidates)["item_name"] == "Dây điện đơn gói 100"


def test_sku_is_preferred_over_name():
    candidates = [item("Bút bi", sku="BB-01"), item("Bút bi xanh", sku="BB-02")]
    assert find_matching_item(item("Bút bi", sku="BB-02"), candidates)["sku"] == "BB-02"


def test_partial_names_still_match_and_pick_the_closest_one():
    candidates = [item("Bút bi xanh loại 1 hộp 12 cây"), item("Bút bi xanh loại 1")]
    chosen = find_matching_item(item("Bút bi xanh"), candidates)
    assert chosen["item_name"] == "Bút bi xanh loại 1"


def test_unmatched_name_returns_none():
    assert find_matching_item(item("Xi măng"), [item("Bút bi")]) is None
    assert find_matching_item(item(""), [item("Bút bi")]) is None


def test_grn_subtotal_uses_the_sku_so_similar_names_do_not_mix_up_prices():
    po_items = [item("Ống nhựa gói 100", sku="ON-100", price=5000), item("Ống nhựa gói 10", sku="ON-10", price=50000)]
    grn = {"line_items": [item("Ống nhựa gói 10", sku="ON-10", qty=2, price=50000)]}
    assert calculate_grn_subtotal(grn, po_items, []) == 100000
