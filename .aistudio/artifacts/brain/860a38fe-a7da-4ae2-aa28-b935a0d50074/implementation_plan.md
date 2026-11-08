# Plan Wdrożenia: Prosty Pasek Zajętości Pojemności Projektu Firebase (`1 GiB per projekt`)

## 1. Cel zmian
Dodanie przejrzystego, minimalistycznego paska ogólnej zajętości pamięci bazy danych **Firebase Cloud Firestore** względem darmowego limitu **1 GiB (`1 024 MB`) przysługującego osobno na każdy projekt Firebase**:
1. W zakładce **Kopie i Konfiguracja** (`AdminTab3ConfigAndBackup.tsx`) w bieżącej aplikacji,
2. W dokumentacji **`FIREBASE_BLUEPRINT_GUIDE.md`** (wraz z aktualizacją Master Promptu w Rozdziale 1 i gotowym kodem wzorcowym), aby jutro w drugim projekcie funkcja ta wdrożyła się automatycznie.

---

## 2. Zakres zmian technicznych

### A. Funkcja obliczania zajętości projektu względem 1 GiB (`estimateFirestoreProjectStorage`)
- Oblicza łączny rozmiar wszystkich kolekcji projektu w bajtach UTF-8 wraz ze standardowym narzutem metadanych dokumentów i indeksów Cloud Firestore.
- Porównuje wynik z limitem planu darmowego Spark: `1 GiB = 1 073 741 824 bajtów (1 024 MB)`.
- Zwraca sformatowaną wartość zajętą (`B` / `KB` / `MB`), procent wykorzystania oraz ilość pozostałego wolnego miejsca z puli `1 GiB`.

### B. Prosty pasek zajętości w zakładce `Kopie i Konfiguracja` (`/src/components/AdminTab3ConfigAndBackup.tsx` oraz `/src/App.tsx`)
- Przekazanie łącznego rozmiaru dokumentów do `AdminTab3ConfigAndBackup`.
- Wyświetlenie w karcie aktywnego projektu Firebase czytelnego paska postępu:
  - Nagłówek: **Zajętość pamięci projektu Firebase (Limit 1 GiB per projekt)**,
  - Wartość: np. **`38.4 KB / 1 GiB (0.004%) · Wolne: 1 023.96 MB`**,
  - Kompaktowy pasek wizualny (`h-2 rounded-full`) zmieniający kolor na ostrzegawczy dopiero powyżej 80% zapełnienia.

### C. Dopisanie wzorca do `FIREBASE_BLUEPRINT_GUIDE.md`
- Uzupełnienie Master Promptów w Rozdziale 1 (Wariant A i Wariant B) o wymóg wyświetlenia paska zajętości `1 GiB per projekt`.
- Dodanie gotowego, uniwersalnego kodu funkcji i komponentu paska zajętości do skopiowania 1:1 w kolejnym projekcie.
