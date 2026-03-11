# CS222 Repository Initialization

**Name: Savya Tewari**  
**NetID: stewa**  
**GitHub Username: Shad0wspire**  

## 1. Repository Access
Confirm that you were able to access your team repository.

- Repository URL: https://github.com/SP26-UIUC-CS222/Team-26.002
- Did you receive a GitHub invitation? Yes

If yes:
- How did you find the invitation? (GitHub notifications / email / other)
Email
---

## 2. How I Accessed the Repository

Select one:

- GitHub web interface
- **Local clone using Git**
- Other (describe)

I locally cloned using Git.

If you cloned locally, list the commands you used:
git clone https://github.com/SP26-UIUC-CS222/Team-26.002.git
cd Team-26.002
git checkout -b init-stewa
mkdir docs
New-Item docs/stewa.md -ItemType File
git add docs/stewa.md
git commit -m "Add repository initialization document for stewa"
git push -u origin init-stewa
