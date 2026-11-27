# syntax=docker/dockerfile:1

# Build: full SDK, restore from the lock files first so the layer caches between code changes.
FROM mcr.microsoft.com/dotnet/sdk:11.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props .editorconfig ./
COPY src/${{ values.pascalName }}/${{ values.pascalName }}.csproj src/${{ values.pascalName }}/packages.lock.json src/${{ values.pascalName }}/
COPY src/${{ values.pascalName }}.ServiceDefaults/${{ values.pascalName }}.ServiceDefaults.csproj src/${{ values.pascalName }}.ServiceDefaults/packages.lock.json src/${{ values.pascalName }}.ServiceDefaults/
RUN dotnet restore src/${{ values.pascalName }}/${{ values.pascalName }}.csproj --locked-mode
COPY src/ src/
# The OpenAPI document is generated and checked in CI, not inside the image build.
RUN dotnet publish src/${{ values.pascalName }}/${{ values.pascalName }}.csproj \
    --configuration Release --no-restore --output /app \
    -p:OpenApiGenerateDocuments=false

# Run: chiseled Ubuntu, no shell or package manager, runs as the non-root "app" user.
FROM mcr.microsoft.com/dotnet/aspnet:11.0-resolute-chiseled AS final
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "${{ values.pascalName }}.dll"]
