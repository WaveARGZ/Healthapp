/** Firebase Hosting uses the domain root, including builds made by GitHub Actions. */
export function getDeploymentBasePath(environment = process.env) {
  const isGitHubPages = environment.BODYMAKE_HOSTING_TARGET !== "firebase"
    && environment.GITHUB_ACTIONS === "true";
  const repositoryName = environment.GITHUB_REPOSITORY?.split("/")[1] ?? "Healthapp";
  return isGitHubPages ? `/${repositoryName}` : "";
}
