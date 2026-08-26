import sys
import os
from datetime import datetime, date, timedelta, timezone
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.database import SessionLocal, Base, engine
from app.models.user import User, RoleEnum
from app.models.product import Product, Category
from app.models.supplier import Supplier
from app.models.customer import Customer
from app.models.inventory import InventoryBatch, InventoryTransaction, TransactionTypeEnum
from app.models.purchase import Purchase, PurchaseItem
from app.models.sale import Sale, SaleItem

def seed_all():
    db = SessionLocal()
    
    # 0. Clear existing data to avoid conflicts and duplicates
    print("Clearing existing data...")
    db.query(SaleItem).delete()
    db.query(Sale).delete()
    db.query(PurchaseItem).delete()
    db.query(Purchase).delete()
    db.query(InventoryTransaction).delete()
    db.query(InventoryBatch).delete()
    db.query(Product).delete()
    db.query(Category).delete()
    db.query(Customer).delete()
    db.query(Supplier).delete()
    db.commit()

    # 1. Get or create Admin user
    admin_email = "admin@medicalstore.com"
    admin = db.query(User).filter(User.email == admin_email).first()
    if not admin:
        from app.core.security import get_password_hash
        admin = User(
            email=admin_email,
            hashed_password=get_password_hash("admin123"),
            full_name="Store Admin",
            role=RoleEnum.ADMIN,
            is_active=True
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
    print("Admin user verified.")

    # 2. Seed Categories
    print("Seeding Categories...")
    cats = [
        Category(name="Antibiotics", description="Medicines that inhibit the growth of or destroy microorganisms."),
        Category(name="Analgesics", description="Medicines used to achieve analgesia, relief from pain."),
        Category(name="Cardiology", description="Medicines related to cardiovascular health and heart diseases."),
        Category(name="Vitamins", description="Organic compounds essential for normal growth and nutrition.")
    ]
    for c in cats:
        db.add(c)
    db.commit()
    for c in cats:
        db.refresh(c)
    
    cat_map = {c.name: c.id for c in cats}

    # 3. Seed Suppliers
    print("Seeding Suppliers...")
    sups = [
        Supplier(name="Apex Pharmaceuticals", company_name="Apex Ltd", phone="9876543201", email="apex@pharma.com", address="Goregaon East, Mumbai", gst_number="27AAAAA1111A1Z1"),
        Supplier(name="MedLife Distributors", company_name="MedLife Inc", phone="9876543202", email="medlife@dist.com", address="Bandra West, Mumbai", gst_number="27BBBBB2222B2Z2")
    ]
    for s in sups:
        db.add(s)
    db.commit()
    for s in sups:
        db.refresh(s)

    # 4. Seed Customers
    print("Seeding Customers...")
    custs = [
        Customer(name="Ramesh Kumar", phone="9876543210", email="ramesh@gmail.com", address="Andheri East, Mumbai", doctor_name="Dr. Anil Shah"),
        Customer(name="Sunita Sharma", phone="9812345678", email="sunita@gmail.com", address="Kalyan, Mumbai", doctor_name="Dr. Priya Mehta")
    ]
    for cust in custs:
        db.add(cust)
    db.commit()
    for cust in custs:
        db.refresh(cust)

    # 5. Seed Products
    print("Seeding Products...")
    prods = [
        Product(
            name="Amoxicillin 500mg", generic_name="Amoxicillin", brand="Mox 500",
            description="Broad-spectrum penicillin antibiotic.", manufacturer="Sun Pharma",
            pack_size="10 Capsules", mrp=150.0, selling_price=120.0, reorder_level=20,
            barcode="8901111111111", sku="SKU-AMX-500", hsn_code="3004", gst_percentage=12.0,
            prescription_required=True, category_id=cat_map["Antibiotics"]
        ),
        Product(
            name="Paracetamol 650mg", generic_name="Paracetamol", brand="Dolo 650",
            description="Antipyretic and analgesic tablet.", manufacturer="Micro Labs",
            pack_size="15 Tablets", mrp=30.0, selling_price=25.0, reorder_level=50,
            barcode="8902222222222", sku="SKU-PARA-650", hsn_code="3004", gst_percentage=12.0,
            prescription_required=False, category_id=cat_map["Analgesics"]
        ),
        Product(
            name="Atorvastatin 10mg", generic_name="Atorvastatin", brand="Lipitor 10",
            description="Cholesterol-lowering statin medication.", manufacturer="Pfizer",
            pack_size="10 Tablets", mrp=100.0, selling_price=80.0, reorder_level=15,
            barcode="8903333333333", sku="SKU-ATO-10", hsn_code="3004", gst_percentage=12.0,
            prescription_required=True, category_id=cat_map["Cardiology"]
        ),
        Product(
            name="Vitamin C 500mg", generic_name="Ascorbic Acid", brand="Limcee",
            description="Chewable Vitamin C supplement.", manufacturer="Abbott",
            pack_size="15 Chewable Tablets", mrp=50.0, selling_price=40.0, reorder_level=30,
            barcode="8904444444444", sku="SKU-VITC-500", hsn_code="3004", gst_percentage=18.0,
            prescription_required=False, category_id=cat_map["Vitamins"]
        )
    ]
    for p in prods:
        db.add(p)
    db.commit()
    for p in prods:
        db.refresh(p)
    
    prod_map = {p.sku: p for p in prods}

    # 6. Seed Inventory Batches
    print("Seeding Inventory Batches...")
    today = date.today()
    batches = [
        InventoryBatch(
            product_id=prod_map["SKU-AMX-500"].id, batch_number="AMX-204",
            manufacturing_date=today - timedelta(days=60), expiry_date=today + timedelta(days=365),
            quantity_available=150, purchase_price=80.0, mrp=150.0, selling_price=120.0,
            supplier_id=sups[0].id
        ),
        InventoryBatch(
            product_id=prod_map["SKU-PARA-650"].id, batch_number="PARA-881",
            manufacturing_date=today - timedelta(days=30), expiry_date=today + timedelta(days=400),
            quantity_available=300, purchase_price=15.0, mrp=30.0, selling_price=25.0,
            supplier_id=sups[0].id
        ),
        # Low Stock and Expiring Soon batch (expiry within 20 days, quantity <= 10)
        InventoryBatch(
            product_id=prod_map["SKU-ATO-10"].id, batch_number="ATO-441",
            manufacturing_date=today - timedelta(days=120), expiry_date=today + timedelta(days=15),
            quantity_available=8, purchase_price=50.0, mrp=100.0, selling_price=80.0,
            supplier_id=sups[1].id
        ),
        InventoryBatch(
            product_id=prod_map["SKU-VITC-500"].id, batch_number="VITC-302",
            manufacturing_date=today - timedelta(days=90), expiry_date=today + timedelta(days=600),
            quantity_available=250, purchase_price=22.0, mrp=50.0, selling_price=40.0,
            supplier_id=sups[1].id
        )
    ]
    for b in batches:
        db.add(b)
    db.commit()
    for b in batches:
        db.refresh(b)

    # 7. Seed Initial Inventory Transactions
    print("Seeding Inventory Transactions...")
    for b in batches:
        t = InventoryTransaction(
            product_id=b.product_id, batch_id=b.id, quantity_change=b.quantity_available,
            transaction_type=TransactionTypeEnum.INITIAL_STOCK, reference_type="InitialStock",
            reference_id=str(b.product_id), notes="Initial stock setup", user_id=admin.id,
            timestamp=datetime.now(timezone.utc) - timedelta(days=30)
        )
        db.add(t)
    db.commit()

    # 8. Seed Purchases History
    print("Seeding Purchases History...")
    p_date = today - timedelta(days=10)
    purch = Purchase(
        supplier_id=sups[0].id, invoice_number="PUR-9981", purchase_date=p_date,
        total_amount=15 * 200, tax_amount=15 * 200 * 0.12, discount_amount=0.0,
        grand_total=(15 * 200) * 1.12, notes="Bulk setup purchase", created_by=admin.id,
        created_at=datetime.combine(p_date, datetime.min.time(), tzinfo=timezone.utc)
    )
    db.add(purch)
    db.commit()
    db.refresh(purch)

    pi = PurchaseItem(
        purchase_id=purch.id, product_id=prod_map["SKU-PARA-650"].id, batch_number="PARA-881",
        manufacturing_date=today - timedelta(days=30), expiry_date=today + timedelta(days=400),
        quantity=200, purchase_price=15.0, mrp=30.0, selling_price=25.0
    )
    db.add(pi)
    db.commit()

    # 9. Seed Sales History over the last 7 days (to populate Dashboard sales trend charts beautifully)
    print("Seeding Sales History...")
    sales_batch_list = [
        (prod_map["SKU-PARA-650"], batches[1], 12),
        (prod_map["SKU-AMX-500"], batches[0], 4),
        (prod_map["SKU-VITC-500"], batches[3], 8)
    ]

    for i in range(7):
        sale_day = today - timedelta(days=i)
        
        # Create 1-2 sales per day
        for s_idx in range(random.randint(1, 2)):
            # Pick a customer
            cust = custs[random.randint(0, 1)]
            
            invoice_num = f"INV-{sale_day.strftime('%Y%m%d')}-{s_idx+1:02d}"
            
            # Select random items
            chosen_items = random.sample(sales_batch_list, random.randint(1, 3))
            
            total_amt = 0.0
            tax_amt = 0.0
            items_to_create = []
            
            for prod, batch, max_qty in chosen_items:
                qty = random.randint(1, max_qty)
                item_total = qty * prod.selling_price
                total_amt += item_total
                tax_amt += item_total * (prod.gst_percentage / 100.0)
                
                items_to_create.append({
                    "product": prod,
                    "batch": batch,
                    "quantity": qty,
                    "unit_price": prod.selling_price,
                    "total_price": item_total
                })
            
            grand_total = total_amt + tax_amt
            
            # Create Sale
            sale = Sale(
                invoice_number=invoice_num, customer_id=cust.id,
                total_amount=total_amt, tax_amount=tax_amt, discount_amount=0.0,
                grand_total=grand_total, payment_method=random.choice(["Cash", "UPI", "Card"]),
                status="COMPLETED", created_by=admin.id,
                sale_date=datetime.combine(sale_day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=random.randint(9, 18)),
                created_at=datetime.combine(sale_day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=random.randint(9, 18))
            )
            db.add(sale)
            db.flush()
            
            for item in items_to_create:
                # Add SaleItem
                si = SaleItem(
                    sale_id=sale.id, product_id=item["product"].id, batch_id=item["batch"].id,
                    quantity=item["quantity"], unit_price=item["unit_price"], discount=0.0,
                    total_price=item["total_price"]
                )
                db.add(si)
                
                # Add Inventory Transaction
                txn = InventoryTransaction(
                    product_id=item["product"].id, batch_id=item["batch"].id,
                    quantity_change=-item["quantity"], transaction_type=TransactionTypeEnum.SALE,
                    reference_type="Sale", reference_id=str(sale.id),
                    notes=f"Sale Invoice: {invoice_num}", user_id=admin.id,
                    timestamp=sale.created_at
                )
                db.add(txn)
                
                # Deduct quantity from batch available
                item["batch"].quantity_available = max(0, item["batch"].quantity_available - item["quantity"])
                db.add(item["batch"])
                
    db.commit()
    print("Database seeding completed successfully!")
    db.close()

if __name__ == "__main__":
    seed_all()
