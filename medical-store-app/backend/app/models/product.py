from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database.database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    products = relationship("Product", back_populates="category")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    generic_name = Column(String, nullable=True)
    brand = Column(String, index=True, nullable=True)
    description = Column(Text, nullable=True)
    manufacturer = Column(String, nullable=True)
    pack_size = Column(String, nullable=True) # e.g. "15 Tablets"
    image_url = Column(String, nullable=True)
    mrp = Column(Float, nullable=False)
    selling_price = Column(Float, nullable=False)
    reorder_level = Column(Integer, default=10)
    barcode = Column(String, unique=True, index=True, nullable=True)
    sku = Column(String, unique=True, index=True, nullable=True)
    hsn_code = Column(String, nullable=True)
    gst_percentage = Column(Float, default=0.0)
    prescription_required = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    is_archived = Column(Boolean, default=False)
    
    category_id = Column(Integer, ForeignKey("categories.id"))
    category = relationship("Category", back_populates="products")
