"""
Shared Authoritative Pricing Service for MedX Pharmacy Management System.

Enforces GST-Inclusive Pricing & Pharmacy Billing Rules in India:
- MRP: Maximum Retail Price (inclusive of all taxes).
- Selling Price (SP): Actual retail price charged to customer (inclusive of GST).
- Taxable Value: Extracted mathematically from inclusive consideration:
    Taxable Value = Consideration / (1 + GST Rate / 100)
- GST Amount: Tax already included in Selling Price:
    GST Included = Consideration - Taxable Value
- Discount: Difference between MRP and Selling Price:
    MRP Discount = (MRP - SP) * Quantity
    MRP Discount % = ((MRP - SP) / MRP) * 100
- Multi-Rate Cart: Line-by-line calculation aggregated and grouped by applicable GST rate.
- Grand Total: Derived from inclusive selling price consideration (rounded to nearest rupee).
  GST is NEVER added on top.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Any, Optional

PRECISION_2 = Decimal("0.01")
PRECISION_4 = Decimal("0.0001")


def round_money(val: Decimal) -> Decimal:
    """Strictly rounds monetary values to 2 decimal places using standard ROUND_HALF_UP."""
    if not isinstance(val, Decimal):
        val = Decimal(str(val))
    return val.quantize(PRECISION_2, rounding=ROUND_HALF_UP)


class PricingService:
    @staticmethod
    def calculate_line_item(
        mrp: Decimal,
        selling_price: Decimal,
        quantity: Decimal,
        gst_percentage: Decimal,
        additional_discount: Decimal = Decimal("0.00"),
        is_interstate: bool = False,
    ) -> Dict[str, Any]:
        """
        Calculates financial line details for a single product/batch item.
        Selling price is GST-inclusive.
        """
        mrp = Decimal(str(mrp or "0.00"))
        selling_price = Decimal(str(selling_price or "0.00"))
        quantity = Decimal(str(quantity or "1.0000"))
        gst_percentage = Decimal(str(gst_percentage or "0.00"))
        additional_discount = Decimal(str(additional_discount or "0.00"))

        if quantity < Decimal("0"):
            quantity = Decimal("0")
        if selling_price < Decimal("0"):
            selling_price = Decimal("0")
        if mrp < Decimal("0"):
            mrp = Decimal("0")
        if gst_percentage < Decimal("0"):
            gst_percentage = Decimal("0")

        # Total MRP for the line
        mrp_line_total = round_money(mrp * quantity)

        # Gross line total at Selling Price (inclusive of GST)
        gross_line_total = round_money(selling_price * quantity)

        # MRP-to-SP Discount
        if mrp > selling_price:
            mrp_unit_discount = round_money(mrp - selling_price)
            mrp_line_discount = round_money(mrp_unit_discount * quantity)
            if mrp > Decimal("0"):
                mrp_discount_percent = round_money(((mrp - selling_price) / mrp) * Decimal("100.0"))
            else:
                mrp_discount_percent = Decimal("0.00")
        else:
            mrp_unit_discount = Decimal("0.00")
            mrp_line_discount = Decimal("0.00")
            mrp_discount_percent = Decimal("0.00")

        # Effective consideration after any cashier/additional line discount
        effective_line_total = max(Decimal("0.00"), gross_line_total - additional_discount)

        # Taxable Value & GST Amount Extraction (GST-inclusive formula)
        if gst_percentage > Decimal("0"):
            divisor = Decimal("1.0") + (gst_percentage / Decimal("100.0"))
            taxable_amount = round_money(effective_line_total / divisor)
            gst_amount = round_money(effective_line_total - taxable_amount)
        else:
            taxable_amount = effective_line_total
            gst_amount = Decimal("0.00")

        # Tax components: CGST / SGST (intra-state) or IGST (inter-state)
        if is_interstate:
            cgst_amount = Decimal("0.00")
            sgst_amount = Decimal("0.00")
            igst_amount = gst_amount
        else:
            # Split evenly without losing 1 paisa
            cgst_amount = round_money(gst_amount / Decimal("2.0"))
            sgst_amount = round_money(gst_amount - cgst_amount)
            igst_amount = Decimal("0.00")

        return {
            "mrp": round_money(mrp),
            "selling_price": round_money(selling_price),
            "quantity": quantity,
            "mrp_line_total": mrp_line_total,
            "gross_line_total": gross_line_total,
            "effective_line_total": effective_line_total,
            "mrp_unit_discount": mrp_unit_discount,
            "mrp_line_discount": mrp_line_discount,
            "mrp_discount_percent": mrp_discount_percent,
            "additional_discount": additional_discount,
            "gst_percentage": round_money(gst_percentage),
            "taxable_amount": taxable_amount,
            "gst_amount": gst_amount,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "igst_amount": igst_amount,
            "final_line_total": effective_line_total,
        }

    @staticmethod
    def calculate_cart(
        items: List[Dict[str, Any]],
        discount_percent: Decimal = Decimal("0.00"),
        discount_amount: Decimal = Decimal("0.00"),
        is_interstate: bool = False,
    ) -> Dict[str, Any]:
        """
        Authoritative calculation of an entire sales cart with multiple GST rates.
        Aggregates lines, handles order-level discounts, extracts taxes, and groups GST breakdown.
        """
        discount_percent = Decimal(str(discount_percent or "0.00"))
        discount_amount = Decimal(str(discount_amount or "0.00"))

        calculated_lines = []
        total_mrp = Decimal("0.00")
        total_gross = Decimal("0.00")
        total_mrp_discount = Decimal("0.00")

        # First pass: calculate gross lines
        for item in items:
            mrp = Decimal(str(item.get("mrp") or "0.00"))
            selling_price = Decimal(str(item.get("selling_price") or item.get("unit_price") or "0.00"))
            quantity = Decimal(str(item.get("quantity") or "1"))
            gst_percentage = Decimal(str(item.get("gst_percentage") or item.get("gst_rate") or "0.00"))
            line_disc = Decimal(str(item.get("discount") or "0.00"))

            line_calc = PricingService.calculate_line_item(
                mrp=mrp,
                selling_price=selling_price,
                quantity=quantity,
                gst_percentage=gst_percentage,
                additional_discount=line_disc,
                is_interstate=is_interstate,
            )
            # Retain original item metadata
            line_calc["product_id"] = item.get("product_id")
            line_calc["batch_id"] = item.get("batch_id")
            line_calc["product_name"] = item.get("product_name")
            line_calc["batch_number"] = item.get("batch_number")
            line_calc["hsn_code"] = item.get("hsn_code")

            calculated_lines.append(line_calc)
            total_mrp += line_calc["mrp_line_total"]
            total_gross += line_calc["gross_line_total"]
            total_mrp_discount += line_calc["mrp_line_discount"]

        # Overall MRP Discount percentage (weighted)
        if total_mrp > Decimal("0.00"):
            overall_mrp_discount_percent = round_money((total_mrp_discount / total_mrp) * Decimal("100.0"))
        else:
            overall_mrp_discount_percent = Decimal("0.00")

        effective_base = max(total_mrp, total_gross)

        # Determine authoritative order discount
        # Automatically accounts for difference between MRP and Selling Price
        if discount_amount > Decimal("0.00"):
            if discount_amount >= total_mrp_discount:
                final_discount = round_money(min(effective_base, discount_amount))
            else:
                final_discount = round_money(min(effective_base, total_mrp_discount + discount_amount))
        elif discount_percent > Decimal("0.00"):
            if abs(discount_percent - overall_mrp_discount_percent) < Decimal("0.02"):
                final_discount = total_mrp_discount
            elif discount_percent > overall_mrp_discount_percent and effective_base > Decimal("0.00"):
                final_discount = round_money(effective_base * (discount_percent / Decimal("100.0")))
            else:
                extra = round_money(total_gross * (discount_percent / Decimal("100.0")))
                final_discount = total_mrp_discount + extra
        else:
            final_discount = total_mrp_discount

        # Additional cashier reduction beyond base Selling Price (if any)
        extra_cashier_disc = max(Decimal("0.00"), final_discount - total_mrp_discount)

        # Pro-rate any extra cashier reduction across lines for exact GST taxable extraction
        total_taxable = Decimal("0.00")
        total_gst = Decimal("0.00")
        total_cgst = Decimal("0.00")
        total_sgst = Decimal("0.00")
        total_igst = Decimal("0.00")
        tax_breakdown: Dict[str, Dict[str, Decimal]] = {}

        for line in calculated_lines:
            if extra_cashier_disc > Decimal("0.00") and total_gross > Decimal("0.00"):
                line_extra = round_money(extra_cashier_disc * (line["gross_line_total"] / total_gross))
                effective_line = max(Decimal("0.00"), line["effective_line_total"] - line_extra)
            else:
                effective_line = line["effective_line_total"]

            gst_rate = line["gst_percentage"]
            if gst_rate > Decimal("0.00"):
                divisor = Decimal("1.0") + (gst_rate / Decimal("100.0"))
                line_taxable = round_money(effective_line / divisor)
                line_tax = round_money(effective_line - line_taxable)
            else:
                line_taxable = effective_line
                line_tax = Decimal("0.00")

            if is_interstate:
                line_cgst = Decimal("0.00")
                line_sgst = Decimal("0.00")
                line_igst = line_tax
            else:
                line_cgst = round_money(line_tax / Decimal("2.0"))
                line_sgst = round_money(line_tax - line_cgst)
                line_igst = Decimal("0.00")

            line["taxable_amount"] = line_taxable
            line["gst_amount"] = line_tax
            line["cgst_amount"] = line_cgst
            line["sgst_amount"] = line_sgst
            line["igst_amount"] = line_igst
            line["final_line_total"] = effective_line

            total_taxable += line_taxable
            total_gst += line_tax
            total_cgst += line_cgst
            total_sgst += line_sgst
            total_igst += line_igst

            # Group into tax breakdown
            rate_key = f"{gst_rate:.1f}%" if gst_rate % 1 != 0 else f"{int(gst_rate)}%"
            if rate_key not in tax_breakdown:
                tax_breakdown[rate_key] = {
                    "rate": gst_rate,
                    "taxable_amount": Decimal("0.00"),
                    "gst_amount": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                }
            tax_breakdown[rate_key]["taxable_amount"] += line_taxable
            tax_breakdown[rate_key]["gst_amount"] += line_tax
            tax_breakdown[rate_key]["cgst_amount"] += line_cgst
            tax_breakdown[rate_key]["sgst_amount"] += line_sgst
            tax_breakdown[rate_key]["igst_amount"] += line_igst

        # Final payable amount based on effective base minus final discount
        net_payable_raw = max(Decimal("0.00"), effective_base - final_discount)
        rounded_grand_total = net_payable_raw.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(PRECISION_2)
        round_off = round_money(rounded_grand_total - net_payable_raw)

        return {
            "total_mrp": total_mrp,
            "total_mrp_discount": total_mrp_discount,
            "overall_mrp_discount_percent": overall_mrp_discount_percent,
            "subtotal": effective_base,
            "order_discount": final_discount,
            "taxable_amount": total_taxable,
            "tax_amount": total_gst,
            "cgst_amount": total_cgst,
            "sgst_amount": total_sgst,
            "igst_amount": total_igst,
            "tax_breakdown": tax_breakdown,
            "raw_grand_total": net_payable_raw,
            "round_off": round_off,
            "grand_total": rounded_grand_total,
            "items": calculated_lines,
        }
