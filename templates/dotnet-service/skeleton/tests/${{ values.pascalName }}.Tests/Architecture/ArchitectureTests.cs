using System.Text.RegularExpressions;
using ${{ values.pascalName }}.Features.Orders.Domain;
using static ArchUnitNET.Fluent.ArchRuleDefinition;
using ArchitectureModel = ArchUnitNET.Domain.Architecture;

namespace ${{ values.pascalName }}.Tests.Architecture;

// The design rules from docs/architecture.md, enforced on every build instead of in code review.
public sealed class ArchitectureTests
{
    private const string Root = "${{ values.pascalName }}";

    // Anything with side effects or framework coupling. The domain must not touch any of it.
    private const string Impure =
        @"^(Microsoft\.AspNetCore|Microsoft\.Extensions|OpenTelemetry|System\.Net|System\.IO|System\.Data|System\.Diagnostics\.Metrics|System\.Threading\.Tasks)(\..*)?$";

    private static readonly ArchitectureModel Service =
        new ArchLoader().LoadAssemblies(typeof(Order).Assembly).Build();

    private static readonly string DomainNamespaces = $@"^{Root}\.Features\.\w+\.Domain$";

    [Fact]
    public void Domain_has_no_framework_or_io_dependencies() =>
        Types().That().ResideInNamespaceMatching(DomainNamespaces)
            .Should().NotDependOnAnyTypesThat().ResideInNamespaceMatching(Impure)
            .Because("the domain is pure: side effects belong in handlers and endpoints")
            .Check(Service);

    [Fact]
    public void Domain_does_not_read_the_clock_or_randomness() =>
        Types().That().ResideInNamespaceMatching(DomainNamespaces)
            .Should().NotDependOnAnyTypesThat().HaveFullNameMatching(@"^System\.(TimeProvider|Random|Environment|Console|Diagnostics\.Activity|Diagnostics\.ActivitySource)$")
            .Because("time, ids and randomness are passed in, so the same input always gives the same output")
            .Check(Service);

    [Fact]
    public void Domain_does_not_depend_on_slices_or_ports() =>
        Types().That().ResideInNamespaceMatching(DomainNamespaces)
            .Should().NotDependOnAnyTypesThat().ResideInNamespaceMatching($@"^{Root}\.Features\.\w+(\.(?!Domain$)\w+)?$")
            .Because("slices depend on the domain, never the other way round")
            .Check(Service);

    [Fact]
    public void Domain_classes_are_immutable() =>
        Classes().That().ResideInNamespaceMatching(DomainNamespaces).And().AreRecord()
            .Should().BeImmutable()
            .Check(Service);

    [Fact]
    public void Validation_is_pure() =>
        Types().That().HaveNameEndingWith("Validation")
            .Should().NotDependOnAnyTypesThat().ResideInNamespaceMatching(Impure)
            .AndShould().NotDependOnAnyTypesThat().HaveNameEndingWith("Store")
            .Because("validation only looks at the request; it never loads data or logs")
            .Check(Service);

    [Fact]
    public void Shared_does_not_depend_on_features() =>
        Types().That().ResideInNamespaceMatching($@"^{Root}\.Shared(\..*)?$")
            .Should().NotDependOnAnyTypesThat().ResideInNamespaceMatching($@"^{Root}\.Features(\..*)?$")
            .Check(Service);

    [Fact]
    public void Slices_do_not_depend_on_each_other()
    {
        var slicePattern = new Regex($@"^{Root}\.Features\.(?<feature>\w+)\.(?<slice>\w+)$");
        var slices = Service.Namespaces
            .Select(ns => ns.FullName)
            .Where(name => slicePattern.IsMatch(name) && !name.EndsWith(".Domain", StringComparison.Ordinal))
            .ToList();

        Assert.NotEmpty(slices);

        foreach (var slice in slices)
        {
            var others = slices.Where(other => other != slice).Select(Regex.Escape).ToList();
            if (others.Count == 0)
            {
                continue;
            }

            Types().That().ResideInNamespace(slice)
                .Should().NotDependOnAnyTypesThat().ResideInNamespaceMatching($"^({string.Join('|', others)})$")
                .Because("a slice owns its whole use case; share through the feature's domain or ports instead")
                .Check(Service);
        }
    }
}
