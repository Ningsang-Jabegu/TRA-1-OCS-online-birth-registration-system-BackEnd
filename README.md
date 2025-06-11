<p align="center">
    <img src="https://github.com/Ningsang-Jabegu/TRA-1-OCS-online-birth-registration-system/blob/main/src/assets/photoUsed/Coat_Of_Arms_Logo.png?raw=true" alt="Coat of Arms Logo" width="100" style="height:auto;">
</p>

<h1 align="center">Online Birth Registration System (Backend)</h1>

<p align="center"><b>Backend API for seamless, secure, and digital birth registration and certificate management.</b></p>

<br>

**Main Features:**

- **User Registration:** Register new users by storing their personal information—such as `NAME`, `EMAIL`, `PASSWORD`, `ROLE`, and `SECRET_CODE`—in the database (for this project, user data is stored/managed in the `Users_Accounts_Information.csv` file).
- **User Authentication:** During login, users provide their email and password. The backend verifies these credentials, determines the user's name and access privileges, and returns the appropriate components the user is authorized to access.
- **User Roles:** The OBRS (Online Birth Registration System) recognizes three roles: `Citizen`, `Guest`, and `Administrator`, each with distinct access privileges:
    - `Citizen`: Can register births and download certificates.
    - `Guest` (Foreigner): Can view public information and, if needed, request a birth certificate.
    - `Administrator`: Has access to manage system records according to organizational permissions. Note: Administrators may have varying levels of access control.
- **Birth Registration:** `Citizens` can register births directly, while `Guests` require special permission to register a child's birth. `Administrators` with the appropriate privileges can `REVIEW`, `MODIFY`, `REJECT`, `HOLD`, or `APPROVE` birth registrations based on organizational criteria and the information submitted by the user through the website.
- **Certificate Verification:** Anyone—including `Citizens`, `Guests`, `Administrators`, or others—can verify a certificate by scanning the QR code on the certificate or by visiting `/verify/cert/[digital certificate number]`.
- **Digital Certificates:** Only `Citizens` and `Guests` (with special permission) can download and print official birth certificates, which include secure QR codes for verification.

<br>

*This repository contains the backend code powering the above features. For frontend code please visit [TRA-1-OCS-online-birth-registration-system](https://github.com/Ningsang-Jabegu/TRA-1-OCS-online-birth-registration-system.git)*

<br>

---

## 🚀 Getting Started For This Project

### Prerequisites

Ensure you have the following installed:

- Node.js
- npm (Node Package Manager)
- git

> [!IMPORTANT]
> Please create pull requests from your feature branch to the main branch.

> [!NOTE]
> For any issues or questions, refer to the documentation or contact the maintainers.

### Setup Steps

1. **Clone the Repository**

    ```bash
    git clone https://github.com/Ningsang-Jabegu/TRA-1-OCS-online-birth-registration-system-BackEnd.git

    cd TRA-1-OCS-online-birth-registration-system-backend
    ```

2. **Install Dependencies**

    ```bash
    npm i
    ```

3. **Configure Environment Variables**

    - Copy `.env.example` to `.env` and update values as needed. (There is no any `.env` file created till now for this project, if required I will update this file too.)

4. **Run the Application**

    ```bash
    npm run server
    ```

    The backend server will start, typically at `http://localhost:3000`.

5. **API Documentation**

    - Visit `/api/docs` for interactive API documentation. (In progress)

---

## 🛠️ Contributing

- Fork the repository and create your feature branch.
- Commit using [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Push your branch and open a pull request.

---

## 📄 License

This project is licensed under the MIT License.

---

<p align="center"><b>Empowering digital birth registration for everyone.</b></p>
