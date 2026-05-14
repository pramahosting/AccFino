from sqlalchemy import Column, Integer, String, Date, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base


class LicenceRecord(Base):
    __tablename__ = "licence_records"

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    licence_type = Column(String(50),  default="demo")    # demo | paid | trial
    payment_mode = Column(String(50),  default="")        # card | bank | invoice | ""
    start_date   = Column(String(20),  default="")        # ISO date string
    end_date     = Column(String(20),  default="")
    notes        = Column(String(500), default="")
    modules      = Column(String(1000), default="")   # JSON list of enabled module keys

    user = relationship("User", backref="licence_records")
