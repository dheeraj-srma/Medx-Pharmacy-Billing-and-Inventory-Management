from sqlalchemy import create_engine, Column, Integer, DateTime
from sqlalchemy.orm import declarative_base, Session
from datetime import datetime, timezone, timedelta

Base = declarative_base()

class Test(Base):
    __tablename__ = 'test'
    id = Column(Integer, primary_key=True)
    dt = Column(DateTime)

engine = create_engine('sqlite:///:memory:')
Base.metadata.create_all(engine)
session = Session(engine)

IST = timezone(timedelta(hours=5, minutes=30))
now = datetime.now(IST)
print("Original:", now)

t = Test(dt=now)
session.add(t)
session.commit()

retrieved = session.query(Test).first().dt
print("Retrieved:", retrieved)
