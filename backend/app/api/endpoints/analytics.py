from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any
from datetime import date, datetime, timedelta, timezone
from app.api import deps
from app.models.sale import Sale
from app.models.inventory import InventoryBatch
from app.models.product import Product
from app.schemas.sale import Sale as SaleSchema

router = APIRouter()

@router.get("/dashboard-stats")
def get_dashboard_stats(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    today = date.today()
    first_day_of_month = today.replace(day=1)
    thirty_days_from_now = today + timedelta(days=30)
    
    # Revenue calculations
    today_sales = db.query(func.sum(Sale.grand_total)).filter(
        func.date(Sale.sale_date) == today
    ).scalar() or 0.0
    
    month_sales = db.query(func.sum(Sale.grand_total)).filter(
        func.date(Sale.sale_date) >= first_day_of_month
    ).scalar() or 0.0
    
    today_invoices = db.query(func.count(Sale.id)).filter(
        func.date(Sale.sale_date) == today
    ).scalar() or 0
    
    # Inventory Alerts
    low_stock_count = db.query(func.count(InventoryBatch.id)).filter(
        InventoryBatch.quantity_available > 0,
        InventoryBatch.quantity_available <= 10
    ).scalar() or 0
    
    expiring_soon_count = db.query(func.count(InventoryBatch.id)).filter(
        InventoryBatch.quantity_available > 0,
        InventoryBatch.expiry_date >= today,
        InventoryBatch.expiry_date <= thirty_days_from_now
    ).scalar() or 0

    return {
        "revenue_today": today_sales,
        "revenue_month": month_sales,
        "invoices_today": today_invoices,
        "low_stock_alerts": low_stock_count,
        "expiring_soon_alerts": expiring_soon_count
    }

@router.get("/recent-sales", response_model=List[SaleSchema])
def get_recent_sales(
    limit: int = 5,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    sales = db.query(Sale).order_by(Sale.created_at.desc()).limit(limit).all()
    return sales

@router.get("/sales-chart")
def get_sales_chart_data(
    days: int = 7,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    # Get total sales per day for the last N days
    end_date = date.today()
    start_date = end_date - timedelta(days=days-1)
    
    # Note: SQLite datetime functions can be tricky, doing simple Python loop
    chart_data = []
    
    # Fetch all sales in the date range
    sales = db.query(Sale.sale_date, Sale.grand_total).filter(
        func.date(Sale.sale_date) >= start_date
    ).all()
    
    # Group by date
    sales_by_date = {}
    for i in range(days):
        d = start_date + timedelta(days=i)
        sales_by_date[d.isoformat()] = 0.0
        
    for s_date, total in sales:
        d_str = s_date.date().isoformat()
        if d_str in sales_by_date:
            sales_by_date[d_str] += total
            
    for k, v in sales_by_date.items():
        chart_data.append({"date": k, "total": v})
        
    return chart_data
