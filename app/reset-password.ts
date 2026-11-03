import { createClient } from "@supabase/supabase-js";

async function resetPassword() {
  const supabase = createClient(
    "https://ttflvhxinxkmpyrpdvvl.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Zmx2aHhpbnhrbXB5cnBkdnZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzQyMzYyNywiZXhwIjoyMTA4OTk5NjI3fQ.BCO1ZSOCtIEZwIeLRLF9MetQm8aPwpADyREkj8X8848",
  );

  const { data, error } = await supabase.auth.admin.updateUserById(
    "f208e139-1475-4565-84c2-38f08cbac638",
    {
      password: "patient123",
      email_confirm: true,
    },
  );

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log("Password updated successfully!");
  console.log("Email:", data.user.email);
}

resetPassword();
