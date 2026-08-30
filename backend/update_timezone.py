import os
import glob

# Files to update
model_files = glob.glob(r'd:\Python\Medical Store Portal\backend\app\models\*.py')
endpoint_files = glob.glob(r'd:\Python\Medical Store Portal\backend\app\api\endpoints\*.py')
security_file = [r'd:\Python\Medical Store Portal\backend\app\core\security.py']
seed_file = [r'd:\Python\Medical Store Portal\backend\seed_data.py']

all_files = model_files + endpoint_files + security_file + seed_file

for filepath in all_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'timezone.utc' in content or 'datetime.utcnow()' in content:
        # Import IST
        if 'from app.core.timezone import IST' not in content:
            # We can insert it after `from datetime import`
            content = content.replace('from datetime import', 'from app.core.timezone import IST\nfrom datetime import', 1)
        
        # Replace timezone.utc with IST
        content = content.replace('timezone.utc', 'IST')
        
        # Replace datetime.utcnow() with datetime.now(IST)
        content = content.replace('datetime.utcnow()', 'datetime.now(IST)')
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")
