namespace Contracts.Constants;

public static class Roles
{
    public const string Customer = "Customer";
    public const string SupportAgent = "SupportAgent";
    public const string Admin = "Admin";

    public const string StaffRoles = $"{SupportAgent},{Admin}";

    public static readonly string[] All = [Customer, SupportAgent, Admin];

    public static bool IsStaff(string role) => role != Customer;
}
