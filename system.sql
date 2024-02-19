CREATE TABLE users (
    user_id NUMBER PRIMARY KEY,
    username VARCHAR2(50) UNIQUE NOT NULL,
    email VARCHAR2(100) NOT NULL,
    password VARCHAR2(100) NOT NULL,
    money NUMBER(10, 2) DEFAULT 100000,
    temporaryPassword VARCHAR2(255) DEFAULT 'systems'
);

CREATE SEQUENCE user_id_seq
  START WITH 1
  INCREMENT BY 1
  NOCACHE
  NOCYCLE;

drop table users;
select * from users;
SELECT * FROM user_sequences;