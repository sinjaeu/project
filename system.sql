CREATE TABLE users (
    user_id NUMBER PRIMARY KEY,
    username VARCHAR2(50) UNIQUE NOT NULL,
    email VARCHAR2(100) NOT NULL,
    password VARCHAR2(100) NOT NULL,
    money NUMBER(38, 2) DEFAULT 10000000000,
    transaction_count NUMBER DEFAULT 0,
    temporaryPassword VARCHAR2(255) DEFAULT 'systems'
);

CREATE SEQUENCE user_id_seq
  START WITH 1
  INCREMENT BY 1
  NOCACHE
  NOCYCLE;
  
CREATE TABLE stock_holdings (
  username VARCHAR2(50) NOT NULL,
  stock VARCHAR2(100) not null,
  quantity NUMBER not null
);
CREATE TABLE currency_holdings (
  username VARCHAR2(50) NOT NULL,
  currency VARCHAR2(100) not null,
  quantity NUMBER not null
);
drop table stock_holdings;
drop table users;
select * from users;
SELECT * FROM user_sequences;
select * from stock_holdings;
select * from currency_holdings;
select * from stock_holdings where username = 'user' and stock = '�Ｚ����';
update users set money = 200000 where username = 'user';
insert into stock_holdings (username, stock, quantity) values ('user', 'LG', 1);
commit;