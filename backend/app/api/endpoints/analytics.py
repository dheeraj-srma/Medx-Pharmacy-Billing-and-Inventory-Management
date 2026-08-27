from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any, Optional
from datetime import date, datetime, timedelta, timezone
from app.api import deps
from app.models.sale import Sale
from app.models.inventory import InventoryBatch
from app.models.product import Product
from app.models.user import RoleEnum
from app.schemas.sale import Sale as SaleSchema

router = APIRouter()

@router.get("/dashboard-stats")
def get_dashboard_stats(
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    today = date.today()
    first_day_of_month = today.replace(day=1)
    thirty_days_from_now = today + timedelta(days=30)
    
    # Base queries
    revenue_today_query = db.query(func.sum(Sale.grand_total)).filter(func.date(Sale.sale_date) == today)
    revenue_month_query = db.query(func.sum(Sale.grand_total)).filter(func.date(Sale.sale_date) >= first_day_of_month)
    invoices_today_query = db.query(func.count(Sale.id)).filter(func.date(Sale.sale_date) == today)
    
    low_stock_query = db.query(func.count(InventoryBatch.id)).filter(
        InventoryBatch.quantity_available > 0,
        InventoryBatch.quantity_available <= 10
    )
    
    expiring_soon_query = db.query(func.count(InventoryBatch.id)).filter(
        InventoryBatch.quantity_available > 0,
        InventoryBatch.expiry_date >= today,
        InventoryBatch.expiry_date <= thirty_days_from_now
    )
    
    if current_user.role == RoleEnum.SUPERADMIN:
        if branch_id:
            revenue_today_query = revenue_today_query.filter(Sale.branch_id == branch_id)
            revenue_month_query = revenue_month_query.filter(Sale.branch_id == branch_id)
            invoices_today_query = invoices_today_query.filter(Sale.branch_id == branch_id)
            low_stock_query = low_stock_query.filter(InventoryBatch.branch_id == branch_id)
            expiring_soon_query = expiring_soon_query.filter(InventoryBatch.branch_id == branch_id)
    else:
        revenue_today_query = revenue_today_query.filter(Sale.branch_id == current_user.branch_id)
        revenue_month_query = revenue_month_query.filter(Sale.branch_id == current_user.branch_id)
        invoices_today_query = invoices_today_query.filter(Sale.branch_id == current_user.branch_id)
        low_stock_query = low_stock_query.filter(InventoryBatch.branch_id == current_user.branch_id)
        expiring_soon_query = expiring_soon_query.filter(InventoryBatch.branch_id == current_user.branch_id)
        
    today_sales = revenue_today_query.scalar() or 0.0
    month_sales = revenue_month_query.scalar() or 0.0
    today_invoices = invoices_today_query.scalar() or 0
    low_stock_count = low_stock_query.scalar() or 0
    expiring_soon_count = expiring_soon_query.scalar() or 0

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
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    query = db.query(Sale)
    if current_user.role == RoleEnum.SUPERADMIN:
        if branch_id:
            query = query.filter(Sale.branch_id == branch_id)
    else:
        query = query.filter(Sale.branch_id == current_user.branch_id)
        
    sales = query.order_by(Sale.created_at.desc()).limit(limit).all()
    return sales

@router.get("/sales-chart")
def get_sales_chart_data(
    days: int = 7,
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    end_date = date.today()
    start_date = end_date - timedelta(days=days-1)
    
    chart_data = []
    
    query = db.query(Sale.sale_date, Sale.grand_total).filter(
        func.date(Sale.sale_date) >= start_date
    )
    
    if current_user.role == RoleEnum.SUPERADMIN:
        if branch_id:
            query = query.filter(Sale.branch_id == branch_id)
    else:
        query = query.filter(Sale.branch_id == current_user.branch_id)
        
    sales = query.all()
    
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
