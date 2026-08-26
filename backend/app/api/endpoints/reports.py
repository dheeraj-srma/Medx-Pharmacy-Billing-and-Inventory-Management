from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any
from datetime import date, datetime, timedelta, timezone
from app.api import deps
from app.models.sale import Sale, SaleItem
from app.models.purchase import Purchase, PurchaseItem
from app.models.inventory import InventoryBatch
from app.models.product import Product

router = APIRouter()

@router.get("/sales")
def get_sales_report(
    start_date: date,
    end_date: date,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    try:
        # 1. Total statistics
        sales_query = db.query(Sale).filter(
            func.date(Sale.sale_date) >= start_date,
            func.date(Sale.sale_date) <= end_date
        )
        
        sales_list = sales_query.all()
        
        total_revenue = sum(s.grand_total for s in sales_list)
        total_tax = sum(s.tax_amount for s in sales_list)
        total_discount = sum(s.discount_amount for s in sales_list)
        total_invoices = len(sales_list)
        
        # 2. Payment methods breakdown
        payment_methods = {"Cash": 0.0, "Card": 0.0, "UPI": 0.0}
        for s in sales_list:
            method = s.payment_method or "Cash"
            if method in payment_methods:
                payment_methods[method] += s.grand_total
            else:
                payment_methods[method] = s.grand_total
                
        # 3. Daily Summary
        # SQLite: use Python date grouping since date strings are stored differently
        daily_summary = {}
        curr = start_date
        while curr <= end_date:
            daily_summary[curr.isoformat()] = {
                "date": curr.isoformat(),
                "invoice_count": 0,
                "subtotal": 0.0,
                "tax": 0.0,
                "discount": 0.0,
                "grand_total": 0.0
            }
            curr += timedelta(days=1)
            
        for s in sales_list:
            # handle datetime/date mapping
            s_date_str = s.sale_date.date().isoformat() if isinstance(s.sale_date, datetime) else s.sale_date.isoformat()
            if s_date_str in daily_summary:
                daily_summary[s_date_str]["invoice_count"] += 1
                daily_summary[s_date_str]["subtotal"] += s.total_amount
                daily_summary[s_date_str]["tax"] += s.tax_amount
                daily_summary[s_date_str]["discount"] += s.discount_amount
                daily_summary[s_date_str]["grand_total"] += s.grand_total
                
        daily_list = sorted(list(daily_summary.values()), key=lambda x: x["date"])
        
        return {
            "total_revenue": total_revenue,
            "total_tax": total_tax,
            "total_discount": total_discount,
            "total_invoices": total_invoices,
            "payment_methods": payment_methods,
            "daily_summary": daily_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate sales report: {str(e)}")

@router.get("/purchases")
def get_purchases_report(
    start_date: date,
    end_date: date,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    try:
        # 1. Total statistics
        purchases_query = db.query(Purchase).filter(
            Purchase.purchase_date >= start_date,
            Purchase.purchase_date <= end_date
        )
        
        purchases_list = purchases_query.all()
        
        total_expense = sum(p.grand_total for p in purchases_list)
        total_tax = sum(p.tax_amount for p in purchases_list)
        total_purchases = len(purchases_list)
        
        # 2. Daily Summary
        daily_summary = {}
        curr = start_date
        while curr <= end_date:
            daily_summary[curr.isoformat()] = {
                "date": curr.isoformat(),
                "purchase_count": 0,
                "grand_total": 0.0
            }
            curr += timedelta(days=1)
            
        for p in purchases_list:
            p_date_str = p.purchase_date.isoformat() if isinstance(p.purchase_date, date) else str(p.purchase_date)
            if p_date_str in daily_summary:
                daily_summary[p_date_str]["purchase_count"] += 1
                daily_summary[p_date_str]["grand_total"] += p.grand_total
                
        daily_list = sorted(list(daily_summary.values()), key=lambda x: x["date"])
        
        return {
            "total_expense": total_expense,
            "total_tax": total_tax,
            "total_purchases": total_purchases,
            "daily_summary": daily_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate purchase report: {str(e)}")

@router.get("/inventory-valuation")
def get_inventory_valuation(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    try:
        # Fetch all batches that have quantity > 0
        batches = db.query(
            InventoryBatch,
            Product.name.label("product_name"),
            Product.sku.label("product_sku")
        ).join(Product, Product.id == InventoryBatch.product_id)\
         .filter(InventoryBatch.quantity_available > 0)\
         .all()
         
        total_products = db.query(func.count(Product.id)).filter(Product.is_active == True).scalar() or 0
        total_batches = len(batches)
        
        total_qty = sum(b[0].quantity_available for b in batches)
        total_valuation_purchase = sum(b[0].quantity_available * b[0].purchase_price for b in batches)
        total_valuation_mrp = sum(b[0].quantity_available * b[0].mrp for b in batches)
        total_valuation_selling = sum(b[0].quantity_available * b[0].selling_price for b in batches)
        
        # Low Stock Batches
        low_stock = []
        # Expiring batches (within 30 days)
        expiring_soon = []
        today = date.today()
        thirty_days_later = today + timedelta(days=30)
        
        for batch_obj, prod_name, prod_sku in batches:
            batch_data = {
                "id": batch_obj.id,
                "product_name": prod_name,
                "sku": prod_sku,
                "batch_number": batch_obj.batch_number,
                "quantity_available": batch_obj.quantity_available,
                "expiry_date": batch_obj.expiry_date.isoformat(),
                "purchase_price": batch_obj.purchase_price,
                "mrp": batch_obj.mrp,
                "selling_price": batch_obj.selling_price
            }
            
            if batch_obj.quantity_available <= 10:
                low_stock.append(batch_data)
                
            if batch_obj.expiry_date >= today and batch_obj.expiry_date <= thirty_days_later:
                expiring_soon.append(batch_data)
                
        return {
            "total_products": total_products,
            "total_batches": total_batches,
            "total_stock_qty": total_qty,
            "valuation_purchase": total_valuation_purchase,
            "valuation_mrp": total_valuation_mrp,
            "valuation_selling": total_valuation_selling,
            "low_stock_items": low_stock,
            "expiring_soon_items": expiring_soon
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate inventory valuation: {str(e)}")
