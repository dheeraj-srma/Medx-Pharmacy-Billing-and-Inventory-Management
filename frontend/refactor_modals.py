import sys
import glob

def refactor_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add import
    import_stmt = 'import { useModal } from "@/providers/ModalProvider";\n'
    if 'useModal' not in content:
        content = content.replace('import { useState', import_stmt + 'import { useState', 1)

    # Add hook
    if 'const { showAlert, showConfirm } = useModal();' not in content:
        for component_name in ["POS", "ProductsList", "Settings", "AddProduct", "InventoryList", "AddPurchase", "PurchasesList", "AddSupplier"]:
            target = f'export default function {component_name}() {{\n'
            if target in content:
                content = content.replace(target, target + '  const { showAlert, showConfirm } = useModal();\n', 1)

    # Specific POS replacements
    if 'POS.tsx' in file_path:
        content = content.replace('window.confirm("Changing the branch will clear your current cart. Do you want to proceed?")', 'await showConfirm("Change Branch", "Changing the branch will clear your current cart. Do you want to proceed?")')
        content = content.replace('const handleBranchChange = (value: string) => {', 'const handleBranchChange = async (value: string) => {')
        content = content.replace('alert("Cannot exceed available stock.");', 'showAlert("Stock Limit", "Cannot exceed available stock.");')
        content = content.replace('alert(error.response?.data?.detail || "Checkout failed");', 'showAlert("Error", error.response?.data?.detail || "Checkout failed");')

    # Specific ProductsList replacements
    if 'ProductsList.tsx' in file_path:
        content = content.replace('if (!window.confirm(`Are you sure you want to deactivate/archive "${product.name}"?`)) {', 'if (!await showConfirm("Confirm Action", `Are you sure you want to deactivate/archive "${product.name}"?`)) {')
        content = content.replace('const handleToggleActive = (product: any) => {', 'const handleToggleActive = async (product: any) => {')
        content = content.replace('alert(err.response?.data?.detail || "Failed to delete product.");', 'showAlert("Error", err.response?.data?.detail || "Failed to delete product.");')

    # Specific Settings replacements
    if 'Settings.tsx' in file_path:
        content = content.replace('if (!confirm("Are you sure you want to deactivate this staff member?")) return;', 'if (!await showConfirm("Deactivate Staff", "Are you sure you want to deactivate this staff member?")) return;')
        content = content.replace('if (!confirm("Are you sure you want to permanently delete this staff member? This action cannot be undone.")) return;', 'if (!await showConfirm("Delete Staff", "Are you sure you want to permanently delete this staff member? This action cannot be undone.")) return;')
        content = content.replace('if (!confirm(`Are you sure you want to delete backup file: ${filename}?`)) return;', 'if (!await showConfirm("Delete Backup", `Are you sure you want to delete backup file: ${filename}?`)) return;')

        content = content.replace('alert("Settings saved successfully!");', 'showAlert("Success", "Settings saved successfully!");')
        content = content.replace('alert("Failed to save settings. Please try again.");', 'showAlert("Error", "Failed to save settings. Please try again.");')
        content = content.replace('alert("Please fill all required fields");', 'showAlert("Warning", "Please fill all required fields");')
        content = content.replace('alert("Staff registered successfully!");', 'showAlert("Success", "Staff registered successfully!");')
        content = content.replace('alert(error.response?.data?.detail || "Registration failed");', 'showAlert("Error", error.response?.data?.detail || "Registration failed");')
        content = content.replace('alert("User updated successfully!");', 'showAlert("Success", "User updated successfully!");')
        content = content.replace('alert(error.response?.data?.detail || "Failed to update user");', 'showAlert("Error", error.response?.data?.detail || "Failed to update user");')
        content = content.replace('alert("Please enter a new password");', 'showAlert("Warning", "Please enter a new password");')
        content = content.replace('alert("Password updated successfully!");', 'showAlert("Success", "Password updated successfully!");')
        content = content.replace('alert(error.response?.data?.detail || "Reset password failed");', 'showAlert("Error", error.response?.data?.detail || "Reset password failed");')
        content = content.replace('alert("Staff member deactivated successfully!");', 'showAlert("Success", "Staff member deactivated successfully!");')
        content = content.replace('alert("Deactivation failed");', 'showAlert("Error", "Deactivation failed");')
        content = content.replace('alert("Staff member permanently deleted successfully!");', 'showAlert("Success", "Staff member permanently deleted successfully!");')
        content = content.replace('alert(error.response?.data?.detail || "Deletion failed. Users with transaction history cannot be deleted; please deactivate them instead.");', 'showAlert("Error", error.response?.data?.detail || "Deletion failed. Users with transaction history cannot be deleted; please deactivate them instead.");')
        content = content.replace('alert(`Backup created successfully: ${res.data.filename}`);', 'showAlert("Success", `Backup created successfully: ${res.data.filename}`);')
        content = content.replace('alert("Backup creation failed.");', 'showAlert("Error", "Backup creation failed.");')
        content = content.replace('alert("Download failed.");', 'showAlert("Error", "Download failed.");')
        content = content.replace('alert("Backup deleted successfully.");', 'showAlert("Success", "Backup deleted successfully.");')
        content = content.replace('alert("Delete failed.");', 'showAlert("Error", "Delete failed.");')
        content = content.replace('alert("SQLite database optimized (vacuumed) successfully!");', 'showAlert("Success", "SQLite database optimized (vacuumed) successfully!");')
        content = content.replace('alert("Optimization failed.");', 'showAlert("Error", "Optimization failed.");')

    # Specific AddProduct replacements
    if 'AddProduct.tsx' in file_path:
        content = content.replace('alert("Failed to load product details.");', 'showAlert("Error", "Failed to load product details.");')
        content = content.replace('alert(detail || `Failed to ${isEditMode ? "update" : "add"} product. Please check your inputs.`);', 'showAlert("Error", detail || `Failed to ${isEditMode ? "update" : "add"} product. Please check your inputs.`);')

    # Specific InventoryList replacements
    if 'InventoryList.tsx' in file_path:
        content = content.replace('alert("Stock adjusted successfully!");', 'showAlert("Success", "Stock adjusted successfully!");')
        content = content.replace('alert(error.response?.data?.detail || "Adjustment failed");', 'showAlert("Error", error.response?.data?.detail || "Adjustment failed");')

    # Specific AddPurchase replacements
    if 'AddPurchase.tsx' in file_path:
        content = content.replace('alert("Failed to record purchase. Please check your inputs.");', 'showAlert("Error", "Failed to record purchase. Please check your inputs.");')

    # Specific PurchasesList replacements
    if 'PurchasesList.tsx' in file_path:
        content = content.replace('alert(`Failed to load inward stock details: ${err.response?.data?.detail || err.message}`);', 'showAlert("Error", `Failed to load inward stock details: ${err.response?.data?.detail || err.message}`);')

    # Specific AddSupplier replacements
    if 'AddSupplier.tsx' in file_path:
        content = content.replace('alert("Failed to load supplier details.");', 'showAlert("Error", "Failed to load supplier details.");')
        content = content.replace('alert(detail || `Failed to ${isEditMode ? "update" : "add"} supplier. Please check your inputs.`);', 'showAlert("Error", detail || `Failed to ${isEditMode ? "update" : "add"} supplier. Please check your inputs.`);')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

files = glob.glob(r'd:\Python\Medical Store Portal\frontend\src\pages\**\*.tsx', recursive=True)
for file in files:
    if 'POS.tsx' in file or 'ProductsList.tsx' in file or 'Settings.tsx' in file or 'AddProduct.tsx' in file or 'InventoryList.tsx' in file or 'AddPurchase.tsx' in file or 'PurchasesList.tsx' in file or 'AddSupplier.tsx' in file:
        refactor_file(file)
