import pandas as pd
import json
from collections import OrderedDict

stock_name = {}
stock_data = pd.read_csv('C:/Users/신재우/Desktop/project/views/상장법인목록 (1) - 상장법인목록 (1).xls.csv')

stock_code = stock_data[['종목코드', '회사명']]

for i,j in zip(stock_data['회사명'], stock_data['종목코드']):
    if len(str(j))<6:
        j='0'*(6-len(str(j)))+str(j)
    stock_name[i] = j
with open('stock_name.json', 'w', encoding='utf-8') as make_file:
    json.dump(stock_name, make_file, ensure_ascii=False)