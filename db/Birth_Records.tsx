// Define the BirthRecord type
export interface BirthRecord {
    id: string;
    childName: string;
    dateOfBirth: string;
    gender: string;
    status: "approved" | "pending";
    certificateUrl?: string;
}

// Example birth records data
export const mockRecords: BirthRecord[] = [
    {
        id: "BR001",
        childName: "Arjun Kumar Sharma",
        dateOfBirth: "2023-05-15",
        gender: "Male",
        status: "approved",
        certificateUrl: "/certificate/BC-2023-001",
    },
    {
        id: "BR002",
        childName: "Maya Rai",
        dateOfBirth: "2023-06-22",
        gender: "Female",
        status: "pending",
    },
    {
        id: "BR003",
        childName: "Rajesh Tamang",
        dateOfBirth: "2023-07-10",
        gender: "Male",
        status: "approved",
        certificateUrl: "/certificate/BC-2023-002",
    },
];