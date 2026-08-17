import pandas as pd
import tkinter as tk
from tkinter import filedialog

# Hide the main tkinter window
root = tk.Tk()
root.withdraw()

# Open file selector
file_path = filedialog.askopenfilename(
    title="Select a Parquet file",
    filetypes=[
        ("Parquet files", "*.parquet"),
        ("All files", "*.*")
    ]
)

# User cancelled
if not file_path:
    print("No file selected.")
    exit()

print(f"Loading: {file_path}")

df = pd.read_parquet(file_path)

print(df)
# print(df.describe())
print(df[df["name"] == "DESIGNER_COFFEE_BEANS"])