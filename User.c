#include "User.h"

int verify(int otp, int input) {
    return otp == input;
}


static size_t payload_source(void *ptr, size_t size __attribute__((unused)),
                             size_t nmemb __attribute__((unused)), void *userp)
{
    const char **payload = (const char **)userp;

    if (*payload && **payload) {
        size_t len = strlen(*payload);
        memcpy(ptr, *payload, len);
        *payload += len;
        return len;
    }
    return 0;
}

void sent_otp_email(const char *email, int otp)
{
    CURL *curl;
    CURLcode res;
    struct curl_slist *recipients = NULL;
    char message[512];

    snprintf(message, sizeof(message),
        "To: %s\r\n"
        "From: sahilprajapati10001@gmail.com\r\n"
        "Subject: Email Verification OTP\r\n"
        "\r\n"
        "Your OTP is: %d\r\n",
        email, otp
    );

    const char *payload = message;

    curl = curl_easy_init();
    if (!curl) return;

    curl_easy_setopt(curl, CURLOPT_URL, "smtps://smtp.gmail.com:465");
    curl_easy_setopt(curl, CURLOPT_USE_SSL, (long)CURLUSESSL_ALL);
    curl_easy_setopt(curl, CURLOPT_USERNAME, "sahilprajapati10001@gmail.com");
    curl_easy_setopt(curl, CURLOPT_PASSWORD, "ygsl teof ecku ybvi");

    curl_easy_setopt(curl, CURLOPT_MAIL_FROM,
                     "<sahilprajapati10001@gmail.com>");
    recipients = curl_slist_append(recipients, email);
    curl_easy_setopt(curl, CURLOPT_MAIL_RCPT, recipients);

    curl_easy_setopt(curl, CURLOPT_READFUNCTION, payload_source);
    curl_easy_setopt(curl, CURLOPT_READDATA, &payload);
    curl_easy_setopt(curl, CURLOPT_UPLOAD, 1L);

    res = curl_easy_perform(curl);

    if (res != CURLE_OK)
        printf("Email send failed: %s\n",
               curl_easy_strerror(res));

    curl_slist_free_all(recipients);
    curl_easy_cleanup(curl);
}

struct student *create_user(const char *name,
                            const char *email,
                            const char *password)
{
    static int next_id = 1;

    struct student *newnode =
        malloc(sizeof *newnode);

    if (!newnode)
        return NULL;

    newnode->id = next_id++;

    strncpy(newnode->name, name,
            sizeof(newnode->name) - 1);
    strncpy(newnode->email, email,
            sizeof(newnode->email) - 1);
    strncpy(newnode->password, password,
            sizeof(newnode->password) - 1);

    newnode->name[sizeof(newnode->name) - 1] = '\0';
    newnode->email[sizeof(newnode->email) - 1] = '\0';
    newnode->password[sizeof(newnode->password) - 1] = '\0';

    newnode->left = NULL;
    newnode->right = NULL;

    return newnode;
}

struct student *insert_user(struct student *root,
                            struct student *newnode)
{
    if (!root)
        return newnode;

    int cmp = strcmp(newnode->email, root->email);

    if (cmp < 0)
        root->left = insert_user(root->left, newnode);
    else if (cmp > 0)
        root->right = insert_user(root->right, newnode);
    else {
        free(newnode);
    }

    return root;
}


struct student *search_user_by_email(struct student *root,
                                     const char *email)
{
    if (!root)
        return NULL;

    int cmp = strcmp(email, root->email);

    if (cmp == 0)
        return root;
    else if (cmp < 0)
        return search_user_by_email(root->left, email);
    else
        return search_user_by_email(root->right, email);
}

int authenticate_user(struct student *root,
                      const char *email,
                      const char *password)
{
    struct student *user =
        search_user_by_email(root, email);

    if (!user)
        return 0;

    return strcmp(user->password, password) == 0;
}

void free_users(struct student *root)
{
    if (!root) return;
    free_users(root->left);
    free_users(root->right);
    free(root);
}
